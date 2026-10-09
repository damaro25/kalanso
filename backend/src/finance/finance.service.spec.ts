import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
      expect(moisCourant).toMatchObject({ annee: 2027, mois: 2 });
      // tout bulletin compte dès sa création : aucun filtre sur le statut (brouillon compris)
      expect(moisCourant).not.toHaveProperty('statut');
      const anneeScolaire = requetes.find((w: any) => w.OR);
      expect(anneeScolaire).not.toHaveProperty('statut');
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

  describe('tresorerieParMois (tableau de trésorerie)', () => {
    const paiement = (iso: string, montant: number, eleveId: string, anneeScolaireId = 'a1') => ({
      montant,
      datePaiement: new Date(iso),
      facture: { eleveId, anneeScolaireId },
    });

    beforeEach(() => {
      prisma.paiement.findMany.mockResolvedValue([
        paiement('2026-10-05T12:00:00Z', 300000, 'e1'),
        paiement('2026-10-20T12:00:00Z', 100000, 'e2'),
        paiement('2026-11-10T12:00:00Z', 200000, 'e1'),
        paiement('2026-12-15T12:00:00Z', 50000, 'e3'), // aucune inscription connue
        paiement('2027-01-12T12:00:00Z', 20000, 'e4', 'a0'), // facture d'une année passée
      ]);
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', anneeScolaireId: 'a1', classe: { niveau: { nom: '6eme', ordre: 6 } } },
        { eleveId: 'e2', anneeScolaireId: 'a1', classe: { niveau: { nom: '5eme', ordre: 5 } } },
        { eleveId: 'e4', anneeScolaireId: 'a0', classe: { niveau: { nom: '4eme', ordre: 4 } } },
        { eleveId: 'e4', anneeScolaireId: 'a1', classe: { niveau: { nom: '3eme', ordre: 3 } } },
      ]);
      prisma.bulletinPaie.findMany.mockResolvedValue([
        { annee: 2026, mois: 10, netAPayer: 250000 },
        { annee: 2026, mois: 11, netAPayer: 250000 },
      ]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([
        { type: 'DEPENSE', categorie: 'Loyer', montant: 70000, date: new Date('2026-10-03T12:00:00Z') },
        { type: 'DEPENSE', categorie: 'Loyer', montant: 70000, date: new Date('2026-11-03T12:00:00Z') },
        { type: 'RECETTE', categorie: 'Cantine', montant: 30000, date: new Date('2026-11-18T12:00:00Z') },
        { type: 'DEPENSE', categorie: 'Loyer', montant: 999, date: new Date('2027-09-10T12:00:00Z') }, // hors année : ignoré
      ]);
    });

    it("affiche les mois d'octobre à juin, comme le budget de trésorerie papier", async () => {
      const r = await service.tresorerieParMois('ecole');
      expect(r.mois.map((m) => m.libelle)).toEqual([
        'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
      ]);
      expect(r.mois[0]).toMatchObject({ annee: 2026, mois: 10 });
      expect(r.mois[3]).toMatchObject({ annee: 2027, mois: 1 });
      expect(r.mois[8]).toMatchObject({ annee: 2027, mois: 6 });
      expect(r.mois.some((m) => m.hors)).toBe(false); // aucune opération hors octobre-juin
      expect(r.anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
    });

    it("une année qui démarre en janvier reste calée sur l'octobre précédent", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({
        ...ANNEE,
        dateDebut: new Date('2027-01-10T12:00:00Z'),
        dateFin: new Date('2027-06-30T12:00:00Z'),
      });
      prisma.paiement.findMany.mockResolvedValue([]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);
      prisma.bulletinPaie.findMany.mockResolvedValue([]);

      const r = await service.tresorerieParMois('ecole');

      expect(r.mois[0]).toMatchObject({ annee: 2026, mois: 10, libelle: 'Octobre' });
      expect(r.mois).toHaveLength(9);
    });

    describe('opérations hors octobre-juin', () => {
      // Année démarrant en juillet, cas fréquent en Guinée.
      const ANNEE_JUILLET = {
        ...ANNEE,
        dateDebut: new Date('2026-07-25T12:00:00Z'),
        dateFin: new Date('2027-05-25T12:00:00Z'),
      };

      it('regroupe ce qui précède octobre dans une colonne « Avant octobre », reportée en trésorerie initiale d\'octobre', async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE_JUILLET);
        prisma.paiement.findMany.mockResolvedValue([
          paiement('2026-08-12T12:00:00Z', 245000, 'e1'),
          paiement('2026-09-20T12:00:00Z', 350000, 'e1'),
          paiement('2026-10-05T12:00:00Z', 650000, 'e1'),
        ]);
        prisma.bulletinPaie.findMany.mockResolvedValue([{ annee: 2026, mois: 9, netAPayer: 100000 }]);
        prisma.mouvementFinancier.findMany.mockResolvedValue([
          { type: 'DEPENSE', categorie: 'Loyer', montant: 70000, date: new Date('2026-10-03T12:00:00Z') },
        ]);

        const r = await service.tresorerieParMois('ecole');

        expect(r.mois).toHaveLength(10);
        expect(r.mois[0]).toMatchObject({ libelle: 'Avant octobre', hors: 'AVANT' });
        expect(r.mois[1]).toMatchObject({ annee: 2026, mois: 10, libelle: 'Octobre' });
        expect(r.mois[9]).toMatchObject({ annee: 2027, mois: 6, libelle: 'Juin' });
        expect(r.encaissements.parMois.slice(0, 2)).toEqual([595000, 650000]);
        expect(r.decaissements.parMois.slice(0, 2)).toEqual([100000, 70000]);
        expect(r.flux.slice(0, 2)).toEqual([495000, 580000]);
        expect(r.tresorerieInitiale[1]).toBe(r.tresorerieFinale[0]);
        // les totaux restent ceux de l'année entière
        expect(r.encaissements.total).toBe(1245000);
        expect(r.decaissements.total).toBe(170000);
        expect(r.benefice).toBe(1075000);
        expect(r.tresorerieFinale[9]).toBe(1075000);
      });

      it('regroupe ce qui suit juin dans une colonne « Après juin »', async () => {
        // ANNEE (par défaut) va jusqu'au 31 juillet 2027
        prisma.paiement.findMany.mockResolvedValue([
          paiement('2027-06-15T12:00:00Z', 5000, 'e1'),
          paiement('2027-07-10T12:00:00Z', 10000, 'e1'),
        ]);
        prisma.bulletinPaie.findMany.mockResolvedValue([]);
        prisma.mouvementFinancier.findMany.mockResolvedValue([]);

        const r = await service.tresorerieParMois('ecole');

        expect(r.mois).toHaveLength(10);
        expect(r.mois[8]).toMatchObject({ libelle: 'Juin' });
        expect(r.mois[9]).toMatchObject({ libelle: 'Après juin', hors: 'APRES' });
        expect(r.encaissements.parMois.slice(8)).toEqual([5000, 10000]);
        expect(r.encaissements.total).toBe(15000);
        expect(r.tresorerieFinale[9]).toBe(15000);
      });

      it('ne montre aucune colonne hors période quand tout est entre octobre et juin', async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE_JUILLET);
        prisma.paiement.findMany.mockResolvedValue([paiement('2026-11-05T12:00:00Z', 1000, 'e1')]);
        prisma.bulletinPaie.findMany.mockResolvedValue([]);
        prisma.mouvementFinancier.findMany.mockResolvedValue([]);

        const r = await service.tresorerieParMois('ecole');

        expect(r.mois).toHaveLength(9);
        expect(r.mois[0].libelle).toBe('Octobre');
      });
    });

    it("annonce les bornes de l'année, pour que le formulaire de dépense refuse une date hors période", async () => {
      const r = await service.tresorerieParMois('ecole');
      expect(r.periode).toEqual({ debut: '2026-10-01', fin: '2027-07-31' });
    });

    it('ventile les encaissements par niveau (selon l\'année de la facture), puis les autres recettes', async () => {
      const { encaissements } = await service.tresorerieParMois('ecole');

      expect(encaissements.lignes.map((l) => [l.libelle, l.origine, l.total])).toEqual([
        ['4eme', 'ELEVES', 20000], // niveau de l'année de la facture (a0), pas 3eme
        ['5eme', 'ELEVES', 100000],
        ['6eme', 'ELEVES', 500000],
        ['Sans niveau', 'ELEVES', 50000],
        ['Cantine', 'MOUVEMENT', 30000],
      ]);
      expect(encaissements.parMois.slice(0, 4)).toEqual([400000, 230000, 50000, 20000]);
      expect(encaissements.parMois.slice(4)).toEqual([0, 0, 0, 0, 0]);
      expect(encaissements.total).toBe(700000);
    });

    it('place les salaires (bulletins de paie) puis les dépenses par catégorie dans les décaissements', async () => {
      const { decaissements } = await service.tresorerieParMois('ecole');

      expect(decaissements.lignes.map((l) => [l.libelle, l.origine, l.total])).toEqual([
        ['Salaires', 'SALAIRES', 500000],
        ['Loyer', 'MOUVEMENT', 140000], // la dépense hors année n'est pas comptée
      ]);
      expect(decaissements.parMois.slice(0, 3)).toEqual([320000, 320000, 0]);
      expect(decaissements.total).toBe(640000);
    });

    it('prend les salaires directement : un bulletin compte dès sa création, brouillon compris', async () => {
      for (const appel of [
        () => service.tresorerieParMois('ecole'),
        () => service.salairesParMois('ecole'),
        () => service.compteResultatParMois('ecole'),
      ]) {
        prisma.bulletinPaie.findMany.mockClear();
        await appel();
        expect(prisma.bulletinPaie.findMany).toHaveBeenCalled();
        for (const [arg] of prisma.bulletinPaie.findMany.mock.calls) {
          expect(arg.where).not.toHaveProperty('statut'); // ni validé seulement, ni brouillon exclu
        }
      }
    });

    it('applique FT = E − D, Ti = Tf du mois précédent (0 le premier mois) et Tf = FT + Ti', async () => {
      const r = await service.tresorerieParMois('ecole');

      expect(r.flux.slice(0, 4)).toEqual([80000, -90000, 50000, 20000]);
      expect(r.tresorerieInitiale.slice(0, 5)).toEqual([0, 80000, -10000, 40000, 60000]);
      expect(r.tresorerieFinale.slice(0, 5)).toEqual([80000, -10000, 40000, 60000, 60000]);

      r.flux.forEach((ft, i) => {
        expect(r.tresorerieFinale[i]).toBe(r.tresorerieInitiale[i] + ft);
        if (i > 0) expect(r.tresorerieInitiale[i]).toBe(r.tresorerieFinale[i - 1]);
      });
    });

    it('le bénéfice vaut encaissements − décaissements, soit la trésorerie finale du dernier mois', async () => {
      const r = await service.tresorerieParMois('ecole');
      expect(r.benefice).toBe(60000);
      expect(r.benefice).toBe(r.tresorerieFinale[r.tresorerieFinale.length - 1]);
      expect(r.benefice).toBe(r.flux.reduce((a, v) => a + v, 0));
    });

    it("cohérent avec le compte de résultat mensuel (même total de recettes et de dépenses)", async () => {
      const t = await service.tresorerieParMois('ecole');
      const cr = await service.compteResultatParMois('ecole');
      expect(t.encaissements.total).toBe(cr.totalRecettes);
      expect(t.decaissements.total).toBe(cr.totalDepenses);
    });

    it("sans aucune opération : poste Salaires à zéro, trésorerie nulle, pas de recherche de niveaux", async () => {
      prisma.paiement.findMany.mockResolvedValue([]);
      prisma.bulletinPaie.findMany.mockResolvedValue([]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([]);

      const r = await service.tresorerieParMois('ecole');

      expect(prisma.inscription.findMany).not.toHaveBeenCalled();
      expect(r.encaissements.lignes).toEqual([]);
      expect(r.decaissements.lignes).toHaveLength(1);
      expect(r.decaissements.lignes[0]).toMatchObject({ libelle: 'Salaires', total: 0 });
      expect(r.tresorerieFinale.every((v) => v === 0)).toBe(true);
      expect(r.benefice).toBe(0);
    });

    it("utilise l'année demandée, cloisonnée par école", async () => {
      await service.tresorerieParMois('ecole', 'a-demandee');
      expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ id: 'a-demandee', ecoleId: 'ecole' });
    });
  });

  describe('statistiquesPaiements (garçons / filles, filtres niveau et classe)', () => {
    const CLASSES = [
      { id: 'c6a', nom: '6eme A', niveauId: 'n6', niveau: { nom: '6eme', ordre: 6 } },
      { id: 'c6b', nom: '6eme B', niveauId: 'n6', niveau: { nom: '6eme', ordre: 6 } },
      { id: 'c5a', nom: '5eme A', niveauId: 'n5', niveau: { nom: '5eme', ordre: 5 } },
    ];
    const inscrit = (eleveId: string, genre: 'M' | 'F') => ({ eleveId, eleve: { genre } });

    beforeEach(() => {
      prisma.classe.findMany.mockResolvedValue(CLASSES);
      prisma.inscription.findMany.mockResolvedValue([
        inscrit('e1', 'M'), // soldé
        inscrit('e2', 'M'), // a versé 40 sur 100
        inscrit('e3', 'F'), // rien versé
        inscrit('e4', 'F'), // aucune facture
        inscrit('e5', 'F'), // soldé
      ]);
      prisma.facture.findMany.mockResolvedValue([
        { eleveId: 'e1', montantTotal: 60, montantPaye: 60 },
        { eleveId: 'e1', montantTotal: 40, montantPaye: 40 },
        { eleveId: 'e2', montantTotal: 100, montantPaye: 40 },
        { eleveId: 'e3', montantTotal: 100, montantPaye: 0 },
        { eleveId: 'e5', montantTotal: 200, montantPaye: 200 },
      ]);
    });

    it('compte payés, non payés, sans facture et reste à payer, pour les garçons, les filles et le total', async () => {
      const r = await service.statistiquesPaiements('ecole');

      expect(r.garcons).toEqual({
        effectif: 2, payes: 1, nonPayes: 1, dontPartiels: 1, sansFacture: 0,
        totalFacture: 200, totalPaye: 140, totalRestant: 60, taux: 70,
      });
      expect(r.filles).toEqual({
        effectif: 3, payes: 1, nonPayes: 1, dontPartiels: 0, sansFacture: 1,
        totalFacture: 300, totalPaye: 200, totalRestant: 100, taux: 66.7,
      });
      expect(r.total).toEqual({
        effectif: 5, payes: 2, nonPayes: 2, dontPartiels: 1, sansFacture: 1,
        totalFacture: 500, totalPaye: 340, totalRestant: 160, taux: 68,
      });
      // chaque élève est dans une seule catégorie
      for (const l of [r.garcons, r.filles, r.total]) expect(l.payes + l.nonPayes + l.sansFacture).toBe(l.effectif);
      expect(r.anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
    });

    it("se limite à l'année scolaire courante, aux inscrits EN_COURS et aux factures non annulées", async () => {
      await service.statistiquesPaiements('ecole');

      expect(prisma.inscription.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', anneeScolaireId: 'a1', statut: 'EN_COURS' });
      expect(prisma.facture.findMany.mock.calls[0][0].where).toMatchObject({
        ecoleId: 'ecole',
        anneeScolaireId: 'a1',
        statut: { not: 'ANNULEE' },
        eleveId: { in: ['e1', 'e2', 'e3', 'e4', 'e5'] },
      });
    });

    it('propose les niveaux (une fois chacun) et les classes de l\'année pour les filtres', async () => {
      const r = await service.statistiquesPaiements('ecole');
      expect(r.filtres.niveaux).toEqual([
        { id: 'n6', nom: '6eme' },
        { id: 'n5', nom: '5eme' },
      ]);
      expect(r.filtres.classes).toEqual([
        { id: 'c6a', nom: '6eme A', niveauId: 'n6' },
        { id: 'c6b', nom: '6eme B', niveauId: 'n6' },
        { id: 'c5a', nom: '5eme A', niveauId: 'n5' },
      ]);
      expect(prisma.classe.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', anneeScolaireId: 'a1', actif: true });
    });

    it('filtre par niveau', async () => {
      await service.statistiquesPaiements('ecole', { niveauId: 'n6' });
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({ classe: { niveauId: 'n6' } });
    });

    it('filtre par classe, qui prime sur le niveau', async () => {
      await service.statistiquesPaiements('ecole', { niveauId: 'n6', classeId: 'c6b' });
      const where = prisma.inscription.findMany.mock.calls[0][0].where;
      expect(where.classeId).toBe('c6b');
      expect(where).not.toHaveProperty('classe');
    });

    it("refuse un niveau ou une classe qui n'existe pas cette année (ou d'une autre école)", async () => {
      await expect(service.statistiquesPaiements('ecole', { niveauId: 'n-etranger' })).rejects.toThrow('Niveau invalide');
      await expect(service.statistiquesPaiements('ecole', { classeId: 'c-etrangere' })).rejects.toThrow('Classe invalide');
      expect(prisma.inscription.findMany).not.toHaveBeenCalled();
    });

    it("refuse une classe qui n'appartient pas au niveau choisi", async () => {
      await expect(service.statistiquesPaiements('ecole', { niveauId: 'n5', classeId: 'c6a' })).rejects.toThrow("n'appartient pas à ce niveau");
    });

    it('sans inscrit : tout à zéro et aucune recherche de factures', async () => {
      prisma.inscription.findMany.mockResolvedValue([]);
      const r = await service.statistiquesPaiements('ecole', { classeId: 'c5a' });
      expect(prisma.facture.findMany).not.toHaveBeenCalled();
      expect(r.total).toEqual({
        effectif: 0, payes: 0, nonPayes: 0, dontPartiels: 0, sansFacture: 0,
        totalFacture: 0, totalPaye: 0, totalRestant: 0, taux: 0,
      });
    });

    it("utilise l'année demandée, cloisonnée par école", async () => {
      await service.statistiquesPaiements('ecole', { anneeScolaireId: 'a-demandee' });
      expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ id: 'a-demandee', ecoleId: 'ecole' });
    });
  });

  describe('bordereauJournalier (encaissements du jour, une ligne par reçu)', () => {
    const paiement = (
      id: string,
      eleve: { id: string; prenom: string; nom: string; matricule: string | null },
      facture: { id: string; libelle: string; type: string; anneeScolaireId?: string },
      montant: number,
      mode = 'ESPECES',
    ) => ({ id, montant, mode, facture: { anneeScolaireId: 'a1', ...facture, eleve } });
    const djine = { id: 'e1', prenom: 'Djiné', nom: 'KANTE', matricule: '383CR021' };
    const fatoumata = { id: 'e2', prenom: 'Fatoumata', nom: 'BANGOURA', matricule: '501CE022' };
    const sansClasse = { id: 'e3', prenom: 'Aliou', nom: 'CONDE', matricule: null };

    beforeEach(() => {
      prisma.ecole.findUniqueOrThrow.mockResolvedValue({ nom: 'Les Ecoles Mamé-TA', ville: 'Conakry' });
      prisma.niveau.findMany.mockResolvedValue([
        { id: 'n1', nom: 'CP1' },
        { id: 'n6', nom: '6eme' },
      ]);
      prisma.paiement.findMany.mockResolvedValue([
        paiement('rec-1', djine, { id: 'f-insc1', libelle: 'Frais de réinscription - 6eme A', type: 'INSCRIPTION' }, 150000),
        paiement('rec-2', djine, { id: 'f-eco1', libelle: 'Trimestre 1', type: 'ECOLAGE' }, 600000, 'VIREMENT'),
        paiement('rec-3', djine, { id: 'f-eco1', libelle: 'Trimestre 1', type: 'ECOLAGE' }, 200000), // second versement, même facture
        paiement('rec-4', fatoumata, { id: 'f-insc2', libelle: "Frais d'inscription - CP1", type: 'INSCRIPTION' }, 200000, 'MOBILE_MONEY'),
        paiement('rec-5', sansClasse, { id: 'f-cantine', libelle: 'Cantine', type: 'AUTRE' }, 15000),
        paiement('rec-6', fatoumata, { id: 'f-eco2', libelle: 'Ecolage Annuel', type: 'ECOLAGE' }, 100000),
      ]);
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', anneeScolaireId: 'a1', classe: { nom: '6eme A', niveauId: 'n6', niveau: { nom: '6eme', ordre: 6 } } },
        { eleveId: 'e2', anneeScolaireId: 'a1', classe: { nom: 'CP1', niveauId: 'n1', niveau: { nom: 'CP1', ordre: 1 } } },
      ]);
    });

    it('produit une ligne par reçu (paiement), avec le N° de reçu et le N° de la facture réglée', async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });

      expect(r.date).toBe('2026-10-08');
      expect(r.ecole).toEqual({ nom: 'Les Ecoles Mamé-TA', ville: 'Conakry' });
      expect(r.lignes).toHaveLength(6); // deux versements sur la même facture = deux lignes
      expect(r.lignes.map((l) => [l.numeroRecu, l.numeroFacture])).toEqual([
        ['rec-4', 'f-insc2'],
        ['rec-6', 'f-eco2'],
        ['rec-1', 'f-insc1'],
        ['rec-2', 'f-eco1'],
        ['rec-3', 'f-eco1'],
        ['rec-5', 'f-cantine'],
      ]);

      expect(r.lignes[2]).toEqual({
        numeroRecu: 'rec-1',
        numeroFacture: 'f-insc1',
        eleveId: 'e1',
        matricule: '383CR021',
        nomComplet: 'Djiné KANTE',
        classe: '6eme A',
        niveau: '6eme',
        typeOperation: 'Réinscription',
        fraisEtudes: 0,
        totalPaye: 150000,
        date: '2026-10-08',
        observation: 'Espèces',
      });
    });

    it("classe les lignes par niveau puis par classe, comme la feuille papier, les élèves sans classe à la fin", async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(r.lignes.map((l) => l.classe)).toEqual(['CP1', 'CP1', '6eme A', '6eme A', '6eme A', '']);
    });

    it("déduit le type d'opération de la facture : inscription, réinscription, écolage, trimestre ou autre", async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(Object.fromEntries(r.lignes.map((l) => [l.numeroRecu, l.typeOperation]))).toEqual({
        'rec-1': 'Réinscription',
        'rec-2': 'Trimestre 1',
        'rec-3': 'Trimestre 1',
        'rec-4': 'Inscription',
        'rec-5': 'Autre',
        'rec-6': 'Écolage',
      });
    });

    it("ne remplit « frais d'études payés » que pour l'écolage et les trimestres ; le total payé est toujours rempli", async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      const parRecu = Object.fromEntries(r.lignes.map((l) => [l.numeroRecu, l]));

      expect(parRecu['rec-1']).toMatchObject({ fraisEtudes: 0, totalPaye: 150000 }); // réinscription
      expect(parRecu['rec-4']).toMatchObject({ fraisEtudes: 0, totalPaye: 200000 }); // inscription
      expect(parRecu['rec-5']).toMatchObject({ fraisEtudes: 0, totalPaye: 15000 }); // autre
      expect(parRecu['rec-2']).toMatchObject({ fraisEtudes: 600000, totalPaye: 600000 }); // trimestre
      expect(parRecu['rec-6']).toMatchObject({ fraisEtudes: 100000, totalPaye: 100000 }); // écolage
    });

    it("indique le mode de paiement en observation", async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      const parRecu = Object.fromEntries(r.lignes.map((l) => [l.numeroRecu, l.observation]));
      expect(parRecu['rec-2']).toBe('Virement');
      expect(parRecu['rec-4']).toBe('Mobile money');
      expect(parRecu['rec-1']).toBe('Espèces');
    });

    it('totalise les frais d\'études et le total payé', async () => {
      const { totaux } = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(totaux).toEqual({ fraisEtudes: 900000, totalPaye: 1265000 });
    });

    it('ne prend que les paiements de la journée demandée (de 00:00 inclus à 00:00 exclu)', async () => {
      await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(prisma.paiement.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        datePaiement: { gte: new Date('2026-10-08T00:00:00.000Z'), lt: new Date('2026-10-09T00:00:00.000Z') },
      });
    });

    it("prend la date du jour quand aucune date n'est donnée", async () => {
      fakeDate('2027-03-01T12:00:00Z');
      const r = await service.bordereauJournalier('ecole');
      expect(r.date).toBe('2027-03-01');
    });

    it('filtre par niveau : seuls les reçus des élèves de ce niveau, ceux sans classe sont écartés', async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08', niveauId: 'n6' });
      expect(r.lignes.map((l) => l.numeroRecu)).toEqual(['rec-1', 'rec-2', 'rec-3']);
      expect(r.totaux).toEqual({ fraisEtudes: 800000, totalPaye: 950000 });
    });

    it("propose les niveaux de l'école pour le filtre", async () => {
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(r.filtres.niveaux).toEqual([
        { id: 'n1', nom: 'CP1' },
        { id: 'n6', nom: '6eme' },
      ]);
      expect(prisma.niveau.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole' });
    });

    it("à défaut d'inscription pour l'année de la facture, retient la classe d'une autre année", async () => {
      prisma.paiement.findMany.mockResolvedValue([
        paiement('rec-9', djine, { id: 'f-ancienne', libelle: 'Ecolage 2025', type: 'ECOLAGE', anneeScolaireId: 'a0' }, 50000),
      ]);
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(r.lignes[0].classe).toBe('6eme A');
    });

    it('refuse une date mal formée ou impossible, et un niveau inconnu', async () => {
      for (const date of ['08/10/2026', '2026-13-45', 'hier', '2026-10-8']) {
        await expect(service.bordereauJournalier('ecole', { date })).rejects.toThrow('Date invalide');
      }
      await expect(service.bordereauJournalier('ecole', { date: '2026-10-08', niveauId: 'n-etranger' })).rejects.toThrow('Niveau invalide');
      expect(prisma.paiement.findMany).not.toHaveBeenCalled();
    });

    it('sans paiement ce jour-là : aucune ligne, totaux à zéro et aucune recherche de classes', async () => {
      prisma.paiement.findMany.mockResolvedValue([]);
      const r = await service.bordereauJournalier('ecole', { date: '2026-10-08' });
      expect(r.lignes).toEqual([]);
      expect(r.totaux).toEqual({ fraisEtudes: 0, totalPaye: 0 });
      expect(prisma.inscription.findMany).not.toHaveBeenCalled();
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

    it("creerMouvement : refuse une dépense « Salaires » (déjà comptée via les bulletins de paie)", async () => {
      for (const categorie of ['Salaires', ' salaires ']) {
        await expect(
          service.creerMouvement('ecole', { type: 'DEPENSE', categorie, libelle: 'Paie', montant: 100 }, 'u1'),
        ).rejects.toThrow('Les salaires se saisissent dans Paie');
      }
      expect(prisma.mouvementFinancier.create).not.toHaveBeenCalled();
    });

    it('supprimerMouvement : refuse un mouvement inconnu ou d\'une autre école', async () => {
      prisma.mouvementFinancier.findFirst.mockResolvedValue(null);
      await expect(service.supprimerMouvement('ecole', 'm1')).rejects.toThrow(BadRequestException);
      expect(prisma.mouvementFinancier.delete).not.toHaveBeenCalled();
    });

    it('supprimerMouvement : une recette se supprime sans code', async () => {
      prisma.mouvementFinancier.findFirst.mockResolvedValue({ id: 'm1', type: 'RECETTE' });
      await service.supprimerMouvement('ecole', 'm1');
      expect(prisma.mouvementFinancier.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });

    describe("supprimerMouvement : code de suppression d'une dépense", () => {
      const ancienCode = process.env.CODE_SUPPRESSION_DEPENSE;
      beforeEach(() => {
        delete process.env.CODE_SUPPRESSION_DEPENSE;
        prisma.mouvementFinancier.findFirst.mockResolvedValue({ id: 'm1', type: 'DEPENSE' });
      });
      afterEach(() => {
        if (ancienCode === undefined) delete process.env.CODE_SUPPRESSION_DEPENSE;
        else process.env.CODE_SUPPRESSION_DEPENSE = ancienCode;
      });

      it('refuse sans code', async () => {
        await expect(service.supprimerMouvement('ecole', 'm1')).rejects.toThrow(ForbiddenException);
        await expect(service.supprimerMouvement('ecole', 'm1', '')).rejects.toThrow('code de suppression est requis');
        expect(prisma.mouvementFinancier.delete).not.toHaveBeenCalled();
      });

      it('refuse un mauvais code', async () => {
        for (const code of ['0000', '2025', '20260', '202']) {
          await expect(service.supprimerMouvement('ecole', 'm1', code)).rejects.toThrow('Code de suppression incorrect');
        }
        expect(prisma.mouvementFinancier.delete).not.toHaveBeenCalled();
      });

      it('supprime avec le bon code (2026 par défaut)', async () => {
        await service.supprimerMouvement('ecole', 'm1', '2026');
        expect(prisma.mouvementFinancier.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
      });

      it('le code peut être changé par CODE_SUPPRESSION_DEPENSE', async () => {
        process.env.CODE_SUPPRESSION_DEPENSE = '4321';
        await expect(service.supprimerMouvement('ecole', 'm1', '2026')).rejects.toThrow(ForbiddenException);
        await service.supprimerMouvement('ecole', 'm1', '4321');
        expect(prisma.mouvementFinancier.delete).toHaveBeenCalledTimes(1);
      });

      it('vérifie le mouvement avant le code : un mouvement inconnu reste une erreur « introuvable »', async () => {
        prisma.mouvementFinancier.findFirst.mockResolvedValue(null);
        await expect(service.supprimerMouvement('ecole', 'm1', '0000')).rejects.toThrow(BadRequestException);
      });
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
