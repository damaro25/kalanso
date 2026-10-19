import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { BudgetService, POSTES_HABITUELS } from './budget.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('BudgetService (budget de trésorerie)', () => {
  let prisma: any;
  let service: BudgetService;
  const ANNEE = {
    id: 'a1',
    libelle: '2025-2026',
    ecoleId: 'ecole',
    dateDebut: new Date('2025-10-01T00:00:00Z'),
    dateFin: new Date('2026-06-30T00:00:00Z'),
  };
  const zeros = () => Array(10).fill(0);

  const inscription = (eleveId: string, regime: string, niveau: string, cycle: string | null) => ({
    eleveId,
    regime,
    classe: { niveau: { nom: niveau, cycle } },
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BudgetService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
    prisma.facture.findMany.mockResolvedValue([]);
    prisma.inscription.findMany.mockResolvedValue([]);
    prisma.budgetDepense.findMany.mockResolvedValue([]);
    prisma.paiement.findMany.mockResolvedValue([]);
    prisma.mouvementFinancier.findMany.mockResolvedValue([]);
    prisma.bulletinPaie.findMany.mockResolvedValue([]);
  });

  describe('budget', () => {
    it("ne prend que l'écolage non annulé de l'année", async () => {
      await service.budget('ecole');
      expect(prisma.facture.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        anneeScolaireId: 'a1',
        type: 'ECOLAGE',
        statut: { not: 'ANNULEE' },
      });
      // la prévision repose sur ce qui a été payé, pas sur le montant facturé
      expect(prisma.facture.findMany.mock.calls[0][0].select).toEqual({ eleveId: true, montantPaye: true });
    });

    it("répartit l'écolage annuel à parts égales d'octobre à juin, rien pendant les vacances", async () => {
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'e1', montantPaye: 1100000 }]);
      prisma.inscription.findMany.mockResolvedValue([inscription('e1', 'EXTERNAT', 'PSM', 'Maternelle')]);

      const b = await service.budget('ecole');
      const externat = b.prevision.encaissements.regimes.find((r) => r.regime === 'EXTERNAT')!;
      const maternelle = externat.lignes.find((l) => l.libelle === 'Maternelle')!;
      // 1 100 000 ÷ 9 : 122 222 d'octobre à mai, le reste (122 224) en juin, rien pendant les vacances
      expect(maternelle.parMois).toEqual([...Array(8).fill(122222), 122224, 0]);
      expect(maternelle.total).toBe(1100000);
      expect(externat.sousTotal.total).toBe(1100000);
      expect(b.prevision.encaissements.total.total).toBe(1100000);
      expect(b.prevision.encaissements.regimes.map((r) => r.libelle)).toEqual([
        'Régime Externat', 'Régime Internat', 'Régime Semi-Internat', 'Régime Pensionnat',
      ]);
      expect(externat.lignes.map((l) => l.libelle)).toEqual(['Maternelle', 'Primaire']);
    });

    it("met la crèche / garderie sur sa propre ligne, quel que soit le régime", async () => {
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'e1', montantPaye: 900000 }]);
      prisma.inscription.findMany.mockResolvedValue([inscription('e1', 'INTERNAT', 'Crèche', 'Maternelle')]);

      const b = await service.budget('ecole');
      expect(b.prevision.encaissements.creche.parMois).toEqual([...Array(9).fill(100000), 0]);
      expect(b.prevision.encaissements.regimes.every((r) => r.sousTotal.total === 0)).toBe(true);
      expect(b.prevision.encaissements.total.total).toBe(900000);
    });

    it("ignore la facture d'un élève sans inscription cette année", async () => {
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'inconnu', montantPaye: 900000 }]);
      const b = await service.budget('ecole');
      expect(b.prevision.encaissements.total.total).toBe(0);
    });

    it('totalise les décaissements par colonne et par poste', async () => {
      prisma.budgetDepense.findMany.mockResolvedValue([
        { id: 'p1', poste: 'Salaires', ordre: 1, montants: [100, 100, 100, 100, 100, 100, 100, 100, 100, 50] },
        { id: 'p2', poste: 'Loyer', ordre: 2, montants: [10, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      ]);
      const b = await service.budget('ecole');
      expect(b.prevision.decaissements.lignes[0]).toMatchObject({ id: 'p1', poste: 'Salaires', total: 950 });
      expect(b.prevision.decaissements.total.parMois).toEqual([110, 100, 100, 100, 100, 100, 100, 100, 100, 50]);
      expect(b.prevision.decaissements.total.total).toBe(960);
    });

    it('calcule FT = E − D, TI = TF précédente (0 en octobre), TF = TI + FT ; le bénéfice est la somme des FT', async () => {
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'e1', montantPaye: 9000000 }]);
      prisma.inscription.findMany.mockResolvedValue([inscription('e1', 'EXTERNAT', 'CP1', 'Primaire')]);
      prisma.budgetDepense.findMany.mockResolvedValue([
        { id: 'p1', poste: 'Salaires', ordre: 1, montants: [1500000, 500000, 0, 0, 0, 0, 0, 0, 0, 200000] },
      ]);

      const { tresorerie: t } = (await service.budget('ecole')).prevision;
      expect(t.flux).toEqual([-500000, 500000, ...Array(7).fill(1000000), -200000]);
      expect(t.initiale.slice(0, 3)).toEqual([0, -500000, 0]);
      expect(t.finale.slice(0, 3)).toEqual([-500000, 0, 1000000]);
      expect(t.finale[9]).toBe(t.benefice);
      expect(t.benefice).toBe(9000000 - 2200000);
      expect(t.totalEncaissements).toBe(9000000);
      expect(t.totalDecaissements).toBe(2200000);
    });

    it('refuse une année scolaire inconnue', async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.budget('ecole', 'autre')).rejects.toThrow('Année scolaire invalide');
    });
  });

  describe('réel (vue principale)', () => {
    const paiement = (iso: string, montant: number, eleveId: string, type = 'ECOLAGE', anneeScolaireId = 'a1') => ({
      montant,
      datePaiement: new Date(iso),
      facture: { eleveId, anneeScolaireId, type },
    });

    it('le total des encaissements réels est la somme de tous les paiements, ventilés comme le budget papier', async () => {
      prisma.paiement.findMany.mockResolvedValue([
        paiement('2025-10-11T12:00:00Z', 300000, 'e1'), // écolage externat primaire
        paiement('2025-11-05T12:00:00Z', 150000, 'e2'), // écolage interne maternelle
        paiement('2025-10-02T12:00:00Z', 50000, 'e1', 'INSCRIPTION'),
        paiement('2025-12-01T12:00:00Z', 25000, 'e1', 'AUTRE'), // assurance
        paiement('2025-10-20T12:00:00Z', 80000, 'e3'), // crèche
        paiement('2026-10-11T12:00:00Z', 200000, 'e1'), // facture de l'année réglée après juin
        paiement('2025-10-15T12:00:00Z', 40000, 'e9', 'ECOLAGE', 'a0'), // facture d'une autre année : comptée dans son année, pas ici
      ]);
      prisma.inscription.findMany.mockResolvedValue([
        { ...inscription('e1', 'EXTERNAT', 'CP1', 'Primaire'), anneeScolaireId: 'a1' },
        { ...inscription('e2', 'INTERNAT', 'PSM', 'Maternelle'), anneeScolaireId: 'a1' },
        { ...inscription('e3', 'EXTERNAT', 'Crèche', 'Maternelle'), anneeScolaireId: 'a1' },
      ]);

      const { reel } = await service.budget('ecole');

      expect(prisma.paiement.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', facture: { anneeScolaireId: 'a1' } });
      expect(reel.encaissements.totalPaiements).toBe(805000);
      expect(reel.encaissements.total.total).toBe(805000);
      expect(reel.colonnes.map((c) => c.libelle)).toEqual([
        'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Après juin',
      ]);
      const externat = reel.encaissements.regimes.find((r) => r.regime === 'EXTERNAT')!;
      expect(externat.lignes.find((l) => l.libelle === 'Primaire')!.parMois).toEqual([300000, 0, 0, 0, 0, 0, 0, 0, 0, 200000]);
      const internat = reel.encaissements.regimes.find((r) => r.regime === 'INTERNAT')!;
      expect(internat.sousTotal.parMois[1]).toBe(150000);
      expect(reel.encaissements.creche.total).toBe(80000);
      const autres = Object.fromEntries(reel.encaissements.autres.map((l) => [l.libelle, l.total]));
      expect(autres["Frais d'inscription / réinscription"]).toBe(50000);
      expect(autres['Autres frais élèves (T-shirt, cantine...)']).toBe(25000);
      expect(autres['Écolage (élève sans classe)']).toBeUndefined();
    });

    it('met chaque formation supplémentaire sur sa ligne, pas dans « Autres frais » ; le total reste la somme des paiements', async () => {
      prisma.paiement.findMany.mockResolvedValue([
        { montant: 25000, datePaiement: new Date('2025-10-11T12:00:00Z'), facture: { eleveId: 'e1', anneeScolaireId: 'a1', type: 'FORMATION', formation: { nom: 'Arabe' } } },
        { montant: 50000, datePaiement: new Date('2025-11-11T12:00:00Z'), facture: { eleveId: 'e1', anneeScolaireId: 'a1', type: 'FORMATION', formation: { nom: 'Informatique' } } },
        { montant: 10000, datePaiement: new Date('2025-11-12T12:00:00Z'), facture: { eleveId: 'e1', anneeScolaireId: 'a1', type: 'AUTRE' } },
        { montant: 15000, datePaiement: new Date('2025-12-01T12:00:00Z'), facture: { eleveId: 'e1', anneeScolaireId: 'a1', type: 'ASSURANCE' } },
      ]);
      const { reel } = await service.budget('ecole');
      const autres = Object.fromEntries(reel.encaissements.autres.map((l) => [l.libelle, l.parMois.slice(0, 2)]));
      expect(autres['Formation : Arabe']).toEqual([25000, 0]);
      expect(autres['Formation : Informatique']).toEqual([0, 50000]);
      expect(autres['Autres frais élèves (T-shirt, cantine...)']).toEqual([0, 10000]);
      expect(reel.encaissements.autres.find((l) => l.libelle === 'T-shirt')!.parMois.slice(0, 3)).toEqual([0, 0, 15000]);
      expect(reel.encaissements.totalPaiements).toBe(100000);
      expect(reel.encaissements.total.total).toBe(100000);
    });

    it('ventile par mois les salaires et les dépenses saisies, et ajoute les autres recettes', async () => {
      prisma.bulletinPaie.findMany.mockResolvedValue([
        { annee: 2025, mois: 10, netAPayer: 1000000 },
        { annee: 2025, mois: 11, netAPayer: 1000000 },
      ]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([
        { type: 'DEPENSE', categorie: 'Loyer', montant: 500000, date: new Date('2025-10-03T12:00:00Z') },
        { type: 'DEPENSE', categorie: 'Loyer', montant: 500000, date: new Date('2025-11-03T12:00:00Z') },
        { type: 'DEPENSE', categorie: 'Fournitures', montant: 70000, date: new Date('2026-01-15T12:00:00Z') },
        { type: 'RECETTE', categorie: 'Don', montant: 90000, date: new Date('2025-12-10T12:00:00Z') },
      ]);

      const { reel } = await service.budget('ecole');

      expect(reel.decaissements.lignes.map((l) => l.libelle)).toEqual(['Salaires', 'Fournitures', 'Loyer']);
      expect(reel.decaissements.lignes[0].parMois.slice(0, 3)).toEqual([1000000, 1000000, 0]);
      expect(reel.decaissements.lignes[2].parMois.slice(0, 3)).toEqual([500000, 500000, 0]);
      expect(reel.decaissements.lignes[1].parMois[3]).toBe(70000);
      expect(reel.decaissements.total.total).toBe(3070000);
      expect(reel.encaissements.autres.find((l) => l.libelle === 'Recette : Don')!.parMois[2]).toBe(90000);
      expect(reel.colonnes).toHaveLength(9); // rien hors période
    });

    it('chaîne la trésorerie : FT = E − D, TI = TF précédente (0 en octobre), TF = TI + FT', async () => {
      prisma.paiement.findMany.mockResolvedValue([
        paiement('2025-10-11T12:00:00Z', 1000000, 'e1'),
        paiement('2025-11-11T12:00:00Z', 1000000, 'e1'),
      ]);
      prisma.mouvementFinancier.findMany.mockResolvedValue([
        { type: 'DEPENSE', categorie: 'Loyer', montant: 1500000, date: new Date('2025-10-03T12:00:00Z') },
      ]);

      const { reel, prevision } = await service.budget('ecole');
      const t = reel.tresorerie;
      expect(t.flux.slice(0, 3)).toEqual([-500000, 1000000, 0]);
      expect(t.initiale.slice(0, 3)).toEqual([0, -500000, 500000]);
      expect(t.finale.slice(0, 3)).toEqual([-500000, 500000, 500000]);
      expect(t.finale[t.finale.length - 1]).toBe(t.benefice);
      expect(t.benefice).toBe(500000);
      // le prévisionnel compare au réel ramené à ses colonnes
      expect(prevision.realise.encaissements.slice(0, 2)).toEqual([1000000, 1000000]);
      expect(prevision.realise.ecartEncaissements[0]).toBe(1000000); // rien de prévu
    });
  });

  describe('postes de dépenses', () => {
    it("ajoute un poste sans code, à la suite des autres", async () => {
      prisma.budgetDepense.findFirst.mockResolvedValue({ ordre: 4 });
      prisma.budgetDepense.create.mockImplementation(({ data }: any) => data);
      const r = await service.ajouterPoste('ecole', { poste: ' Loyer ', montants: zeros() });
      expect(r).toMatchObject({ ecoleId: 'ecole', anneeScolaireId: 'a1', poste: 'Loyer', ordre: 5 });
    });

    it('refuse un nom vide, un mauvais nombre de montants ou un montant négatif', async () => {
      await expect(service.ajouterPoste('ecole', { poste: '  ', montants: zeros() })).rejects.toThrow(BadRequestException);
      await expect(service.ajouterPoste('ecole', { poste: 'Loyer', montants: [1, 2] })).rejects.toThrow(BadRequestException);
      await expect(service.ajouterPoste('ecole', { poste: 'Loyer', montants: [-1, ...Array(9).fill(0)] })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.budgetDepense.create).not.toHaveBeenCalled();
    });

    it("crée les postes habituels seulement si l'année n'en a aucun", async () => {
      prisma.budgetDepense.count.mockResolvedValue(0);
      await service.ajouterPostesHabituels('ecole');
      const data = prisma.budgetDepense.createMany.mock.calls[0][0].data;
      expect(data.map((d: any) => d.poste)).toEqual(POSTES_HABITUELS);
      expect(data[0].montants).toEqual(zeros());

      prisma.budgetDepense.count.mockResolvedValue(3);
      await expect(service.ajouterPostesHabituels('ecole')).rejects.toThrow('déjà des postes');
    });

    it('modifie un poste avec le code 2026', async () => {
      prisma.budgetDepense.findFirst.mockResolvedValue({ id: 'p1', ecoleId: 'ecole' });
      await service.modifierPoste('ecole', 'p1', { poste: 'Salaires', montants: zeros() }, '2026');
      expect(prisma.budgetDepense.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { poste: 'Salaires', montants: zeros() } });
    });

    it('refuse de modifier ou supprimer sans code ou avec un mauvais code', async () => {
      prisma.budgetDepense.findFirst.mockResolvedValue({ id: 'p1', ecoleId: 'ecole' });
      await expect(service.modifierPoste('ecole', 'p1', { poste: 'X' })).rejects.toThrow(ForbiddenException);
      await expect(service.modifierPoste('ecole', 'p1', { poste: 'X' }, '1234')).rejects.toThrow('Code incorrect');
      await expect(service.supprimerPoste('ecole', 'p1')).rejects.toThrow(ForbiddenException);
      await expect(service.supprimerPoste('ecole', 'p1', '1234')).rejects.toThrow(ForbiddenException);
      expect(prisma.budgetDepense.update).not.toHaveBeenCalled();
      expect(prisma.budgetDepense.delete).not.toHaveBeenCalled();
    });

    it('supprime avec le code', async () => {
      prisma.budgetDepense.findFirst.mockResolvedValue({ id: 'p1', ecoleId: 'ecole' });
      await service.supprimerPoste('ecole', 'p1', '2026');
      expect(prisma.budgetDepense.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
    });

    it("refuse le poste d'une autre école", async () => {
      prisma.budgetDepense.findFirst.mockResolvedValue(null);
      await expect(service.supprimerPoste('ecole', 'p-autre', '2026')).rejects.toThrow('Poste introuvable');
      expect(prisma.budgetDepense.findFirst.mock.calls[0][0].where).toEqual({ id: 'p-autre', ecoleId: 'ecole' });
    });
  });
});
