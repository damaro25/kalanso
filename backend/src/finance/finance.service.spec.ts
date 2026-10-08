import { BadRequestException } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

// Année scolaire à cheval sur deux années civiles : Octobre 2026 -> Juillet 2027.
// Dates à midi UTC pour rester stables quel que soit le fuseau de la machine de test.
const ANNEE = {
  id: 'a1',
  libelle: '2026-2027',
  dateDebut: new Date('2026-10-01T12:00:00Z'),
  dateFin: new Date('2027-07-31T12:00:00Z'),
  courante: true,
};

function fakeDate(iso: string) {
  jest.useFakeTimers({
    now: new Date(iso),
    doNotFake: [
      'nextTick', 'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval',
      'setTimeout', 'clearTimeout', 'queueMicrotask', 'performance', 'hrtime',
    ],
  });
}

describe('FinanceService', () => {
  let prisma: any;
  let service: FinanceService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FinanceService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
  });

  afterEach(() => jest.useRealTimers());

  describe("résolution de l'année scolaire", () => {
    it("utilise l'année demandée si elle appartient à l'école", async () => {
      prisma.facture.findMany.mockResolvedValue([]);
      prisma.inscription.findMany.mockResolvedValue([]);
      prisma.bulletinPaie.findMany.mockResolvedValue([]);
      prisma.paiement.findMany.mockResolvedValue([]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);

      await service.dashboard('ecole', 'a-demandee');

      expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ id: 'a-demandee', ecoleId: 'ecole' });
    });

    it('refuse une année qui ne correspond à aucune année de cette école', async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.dashboard('ecole', 'inconnue')).rejects.toThrow('Année scolaire invalide');
    });

    it("à défaut d'année courante, retombe sur la plus récente", async () => {
      prisma.anneeScolaire.findFirst
        .mockResolvedValueOnce(null) // pas de courante
        .mockResolvedValueOnce(ANNEE); // la plus récente
      prisma.facture.findMany.mockResolvedValue([]);
      prisma.inscription.findMany.mockResolvedValue([]);
      prisma.bulletinPaie.findMany.mockResolvedValue([]);
      prisma.paiement.findMany.mockResolvedValue([]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);

      const r = await service.dashboard('ecole');

      expect(r.anneeScolaire.id).toBe('a1');
      expect(prisma.anneeScolaire.findFirst.mock.calls[1][0].orderBy).toEqual({ dateDebut: 'desc' });
    });

    it("lève une erreur claire quand aucune année n'existe", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.dashboard('ecole')).rejects.toThrow('Aucune année scolaire définie');
    });
  });

  describe('dashboard', () => {
    beforeEach(() => {
      fakeDate('2027-02-15T12:00:00Z');

      prisma.facture.findMany.mockResolvedValue([
        { eleveId: 'e1', type: 'ECOLAGE', montantTotal: 1000, montantPaye: 400 },
        { eleveId: 'e1', type: 'INSCRIPTION', montantTotal: 100, montantPaye: 100 },
        { eleveId: 'e2', type: 'ECOLAGE', montantTotal: 500, montantPaye: 500 },
        { eleveId: 'e2', type: 'AUTRE', montantTotal: 50, montantPaye: 0 },
      ]);
      prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }, { eleveId: 'e2' }, { eleveId: 'e4' }]);
      prisma.bulletinPaie.findMany.mockImplementation(async ({ where }: any) =>
        where.OR
          ? [
              { netAPayer: 300, mois: 11, annee: 2026 },
              { netAPayer: 200, mois: 2, annee: 2027 },
            ]
          : [{ netAPayer: 200, mois: 2, annee: 2027 }],
      );
      prisma.paiement.findMany.mockResolvedValue([
        { montant: 900, facture: { type: 'ECOLAGE' } },
        { montant: 100, facture: { type: 'INSCRIPTION' } },
      ]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([
        { type: 'RECETTE', montant: 50 },
        { type: 'DEPENSE', montant: 70 },
      ]);
    });

    it("sépare écolage et inscription ; les factures hors écolage (AUTRE) comptent avec l'écolage", async () => {
      const r = await service.dashboard('ecole');

      // écolage = tout sauf INSCRIPTION : 1000 + 500 + 50
      expect(r.ecolage).toEqual({ totalFacture: 1550, totalEncaisse: 900, totalRestant: 650, tauxRecouvrement: 58.1 });
      expect(r.inscription).toEqual({ totalFacture: 100, totalEncaisse: 100, totalRestant: 0, tauxRecouvrement: 100 });
    });

    it('classe les élèves inscrits : à jour / en retard / sans facture', async () => {
      const r = await service.dashboard('ecole');
      // e1 : reste 600 (retard) ; e2 : reste 50 (retard) ; e4 : aucune facture
      expect(r.eleves).toEqual({ nbInscrits: 3, nbAJour: 0, nbEnRetard: 2, nbSansFacture: 1 });
    });

    it("un élève soldé sur toutes ses factures est « à jour »", async () => {
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'e1', type: 'ECOLAGE', montantTotal: 100, montantPaye: 100 }]);
      prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }]);
      const r = await service.dashboard('ecole');
      expect(r.eleves).toEqual({ nbInscrits: 1, nbAJour: 1, nbEnRetard: 0, nbSansFacture: 0 });
    });

    it("la masse salariale cumule toute l'année scolaire, le mois courant reste calendaire", async () => {
      const r = await service.dashboard('ecole');

      expect(r.moisCourant).toBe('Février');
      expect(r.salaires).toEqual({ masseSalarialeMois: 200, masseSalarialeCumul: 500 });

      const requetes = prisma.bulletinPaie.findMany.mock.calls.map((c: any) => c[0].where);
      const moisCourant = requetes.find((w: any) => !w.OR);
      expect(moisCourant).toMatchObject({ annee: 2027, mois: 2, statut: { not: 'BROUILLON' } });
      const anneeScolaire = requetes.find((w: any) => w.OR);
      expect(anneeScolaire.statut).toEqual({ not: 'BROUILLON' });
      expect(anneeScolaire.OR).toHaveLength(10); // Oct 2026 -> Juil 2027
      expect(anneeScolaire.OR[0]).toEqual({ annee: 2026, mois: 10 });
      expect(anneeScolaire.OR[9]).toEqual({ annee: 2027, mois: 7 });
    });

    it("compte de résultat sur l'année scolaire : recettes, dépenses et résultat net", async () => {
      const r = await service.dashboard('ecole');

      expect(r.compteResultat).toEqual({
        ecolageEncaisse: 900,
        inscriptionEncaisse: 100,
        autresRecettes: 50,
        recettesTotales: 1050,
        depensesSalaires: 500,
        depensesAutres: 70,
        depensesTotales: 570,
        resultatNet: 480,
      });
      expect(r.soldeNet).toBe(900 - 500); // encaissé écolage - salaires cumulés
    });

    it("borne les paiements et mouvements sur [début, fin de l'année + 1 jour[", async () => {
      await service.dashboard('ecole');

      const plage = prisma.paiement.findMany.mock.calls[0][0].where.datePaiement;
      expect(plage.gte).toEqual(new Date('2026-10-01T12:00:00Z'));
      expect(plage.lt).toEqual(new Date('2027-08-01T12:00:00Z')); // le 31 juillet est inclus en entier
      expect(prisma.mouvementFinancier.findMany.mock.calls[0][0].where.date).toEqual(plage);
    });

    it('exclut les factures annulées', async () => {
      await service.dashboard('ecole');
      expect(prisma.facture.findMany.mock.calls[0][0].where).toMatchObject({
        anneeScolaireId: 'a1',
        statut: { not: 'ANNULEE' },
      });
    });

    it('taux de recouvrement à 0 (et non NaN) sans aucune facture', async () => {
      prisma.facture.findMany.mockResolvedValue([]);
      prisma.inscription.findMany.mockResolvedValue([]);
      const r = await service.dashboard('ecole');
      expect(r.ecolage.tauxRecouvrement).toBe(0);
      expect(r.inscription.tauxRecouvrement).toBe(0);
    });
  });

  describe('recettesParMois / salairesParMois / compteResultatParMois', () => {
    it("liste les mois de l'année scolaire dans l'ordre réel (Octobre -> Juillet), pas Janvier-Décembre", async () => {
      prisma.paiement.findMany.mockResolvedValue([]);

      const r = await service.recettesParMois('ecole');

      expect(r.parMois.map((m: any) => m.libelle)).toEqual([
        'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet',
      ]);
      expect(r.parMois[0]).toMatchObject({ annee: 2026, mois: 10 });
      expect(r.parMois[3]).toMatchObject({ annee: 2027, mois: 1 });
    });

    it('affecte chaque paiement au bon mois et ignore ceux hors année scolaire', async () => {
      prisma.paiement.findMany.mockResolvedValue([
        { montant: 100, datePaiement: new Date('2026-11-05T12:00:00Z') },
        { montant: 50, datePaiement: new Date('2026-11-20T12:00:00Z') },
        { montant: 70, datePaiement: new Date('2027-02-10T12:00:00Z') },
        { montant: 999, datePaiement: new Date('2026-09-15T12:00:00Z') }, // avant la rentrée
      ]);

      const r = await service.recettesParMois('ecole');

      const parMois = Object.fromEntries(r.parMois.map((m: any) => [`${m.annee}-${m.mois}`, m.montant]));
      expect(parMois['2026-11']).toBe(150);
      expect(parMois['2027-2']).toBe(70);
      expect(r.total).toBe(220); // le paiement de septembre n'est pas compté
    });

    it('masse salariale : montant par mois et cumul progressif', async () => {
      prisma.bulletinPaie.findMany.mockResolvedValue([
        { annee: 2026, mois: 10, netAPayer: 100 },
        { annee: 2026, mois: 11, netAPayer: 100 },
        { annee: 2027, mois: 1, netAPayer: 50 },
        { annee: 2025, mois: 12, netAPayer: 9999 }, // hors année scolaire
      ]);

      const r = await service.salairesParMois('ecole');

      expect(r.parMois.map((m: any) => m.cumul).slice(0, 4)).toEqual([100, 200, 200, 250]);
      expect(r.total).toBe(250);
    });

    it('compte de résultat mensuel : recettes (paiements + autres recettes) vs dépenses (salaires + autres)', async () => {
      prisma.paiement.findMany.mockResolvedValue([{ montant: 1000, datePaiement: new Date('2026-10-10T12:00:00Z') }]);
      prisma.bulletinPaie.findMany.mockResolvedValue([{ annee: 2026, mois: 10, netAPayer: 400 }]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([
        { type: 'RECETTE', montant: 200, date: new Date('2026-10-12T12:00:00Z') },
        { type: 'DEPENSE', montant: 100, date: new Date('2026-10-15T12:00:00Z') },
      ]);

      const r = await service.compteResultatParMois('ecole');

      expect(r.parMois[0]).toMatchObject({ libelle: 'Octobre', recettes: 1200, depenses: 500, resultat: 700 });
      expect(r.totalRecettes).toBe(1200);
      expect(r.totalDepenses).toBe(500);
      expect(r.resultatNet).toBe(700);
    });
  });

  describe('mouvements financiers', () => {
    it("liste uniquement les mouvements de l'année scolaire, filtrables par type", async () => {
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);

      await service.listMouvements('ecole', undefined, 'DEPENSE');

      const where = prisma.mouvementFinancier.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ ecoleId: 'ecole', type: 'DEPENSE' });
      expect(where.date.gte).toEqual(ANNEE.dateDebut);
    });

    it("sans filtre de type, ne contraint pas le type", async () => {
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);
      await service.listMouvements('ecole');
      expect(prisma.mouvementFinancier.findMany.mock.calls[0][0].where.type).toBeUndefined();
    });

    it("creerMouvement : date fournie respectée, sinon maintenant ; trace l'auteur", async () => {
      prisma.mouvementFinancier.create.mockImplementation(async ({ data }: any) => data);
      fakeDate('2027-03-01T12:00:00Z');

      const avecDate = await service.creerMouvement(
        'ecole',
        { type: 'DEPENSE', categorie: 'Loyer', libelle: 'Mars', montant: 100, date: '2027-02-20' },
        'u1',
      );
      const sansDate = await service.creerMouvement(
        'ecole',
        { type: 'RECETTE', categorie: 'Don', libelle: 'X', montant: 5 },
        'u1',
      );

      expect(avecDate.date).toEqual(new Date('2027-02-20'));
      expect(sansDate.date).toEqual(new Date('2027-03-01T12:00:00Z'));
      expect(avecDate.saisieParId).toBe('u1');
    });

    it('supprimerMouvement : refuse un mouvement inconnu ou d\'une autre école', async () => {
      prisma.mouvementFinancier.findFirst.mockResolvedValue(null);
      await expect(service.supprimerMouvement('ecole', 'm1')).rejects.toThrow(BadRequestException);
      expect(prisma.mouvementFinancier.delete).not.toHaveBeenCalled();
    });

    it('supprimerMouvement : supprime le mouvement trouvé', async () => {
      prisma.mouvementFinancier.findFirst.mockResolvedValue({ id: 'm1' });
      await service.supprimerMouvement('ecole', 'm1');
      expect(prisma.mouvementFinancier.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });

  describe('recouvrementParClasse', () => {
    it('agrège par classe (élèves distincts, facturé, encaissé, reste, taux) triées par nom', async () => {
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', classeId: 'c2', classe: { nom: 'CM1', niveau: { nom: 'CM1' } } },
        { eleveId: 'e2', classeId: 'c1', classe: { nom: '5eme', niveau: { nom: '5eme' } } },
        { eleveId: 'e3', classeId: 'c1', classe: { nom: '5eme', niveau: { nom: '5eme' } } },
      ]);
      prisma.facture.findMany.mockResolvedValue([
        { eleveId: 'e1', montantTotal: 1000, montantPaye: 250 },
        { eleveId: 'e2', montantTotal: 600, montantPaye: 600 },
        { eleveId: 'e2', montantTotal: 400, montantPaye: 0 },
        { eleveId: 'e3', montantTotal: 1000, montantPaye: 500 },
        { eleveId: 'sans-classe', montantTotal: 777, montantPaye: 0 }, // ignoré
      ]);

      const r = await service.recouvrementParClasse('ecole');

      expect(r.classes.map((c: any) => c.classe)).toEqual(['5eme', 'CM1']);
      expect(r.classes[0]).toMatchObject({
        nbEleves: 2,
        totalFacture: 2000,
        totalPaye: 1100,
        totalRestant: 900,
        taux: 55,
      });
      expect(r.classes[1]).toMatchObject({ nbEleves: 1, totalFacture: 1000, totalPaye: 250, taux: 25 });
    });
  });

  describe('eleves (statut de paiement)', () => {
    beforeEach(() => {
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', eleve: { nom: 'A', prenom: 'a', matricule: 'm1' }, classe: { nom: 'C1' } },
        { eleveId: 'e2', eleve: { nom: 'B', prenom: 'b', matricule: 'm2' }, classe: { nom: 'C1' } },
        { eleveId: 'e3', eleve: { nom: 'C', prenom: 'c', matricule: null }, classe: { nom: 'C1' } },
      ]);
      prisma.facture.findMany.mockResolvedValue([
        { eleveId: 'e1', montantTotal: 100, montantPaye: 100 },
        { eleveId: 'e2', montantTotal: 100, montantPaye: 40 },
      ]);
    });

    it('EN_RETARD : seulement ceux qui ont un reste à payer', async () => {
      const r = await service.eleves('ecole', 'EN_RETARD');
      expect(r.eleves.map((e: any) => e.eleveId)).toEqual(['e2']);
      expect(r.eleves[0].reste).toBe(60);
    });

    it('A_JOUR : soldés ET ayant au moins une facture (un élève sans facture n\'est pas « à jour »)', async () => {
      const r = await service.eleves('ecole', 'A_JOUR');
      expect(r.eleves.map((e: any) => e.eleveId)).toEqual(['e1']);
    });

    it('TOUS : tous les inscrits', async () => {
      const r = await service.eleves('ecole', 'TOUS');
      expect(r.eleves).toHaveLength(3);
    });
  });
});
