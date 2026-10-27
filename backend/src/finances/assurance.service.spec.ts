import { BadRequestException } from '@nestjs/common';
import { AssuranceService } from './assurance.service';
import { FacturesService } from './factures.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('Assurance scolaire', () => {
  let prisma: any;
  let factures: FacturesService;
  let service: AssuranceService;
  const ANNEE = { id: 'a1', ecoleId: 'ecole', libelle: '2026-2027', cloturee: false };
  const TARIFS = [
    { cycle: '', montant: 50000 },
    { cycle: 'Maternelle', montant: 30000 },
  ];

  beforeEach(() => {
    prisma = createPrismaMock();
    factures = new FacturesService(prisma);
    service = new AssuranceService(prisma, factures);
    prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
    prisma.anneeScolaire.findUnique.mockResolvedValue(ANNEE);
    prisma.tarifAssurance.findMany.mockResolvedValue(TARIFS);
    prisma.facture.findFirst.mockResolvedValue(null);
    prisma.facture.create.mockImplementation(async ({ data }: any) => ({ id: 'f-new', ...data }));
  });

  describe('montant configurable (par année, par cycle)', () => {
    it("prend le montant du cycle s'il existe, sinon celui de tous les cycles, sinon 0", async () => {
      prisma.niveau.findFirst.mockResolvedValueOnce({ cycle: 'Maternelle' }).mockResolvedValueOnce({ cycle: 'Primaire' });
      expect(await factures.montantAssurance('ecole', 'a1', 'n-ps')).toBe(30000);
      expect(await factures.montantAssurance('ecole', 'a1', 'n-cp')).toBe(50000);
      prisma.tarifAssurance.findMany.mockResolvedValue([]);
      expect(await factures.montantAssurance('ecole', 'a1', 'n-cp')).toBe(0);
    });

    it('enregistre les montants : un vide supprime, un montant crée ou met à jour ; refuse un montant négatif', async () => {
      prisma.niveau.findMany.mockResolvedValue([{ cycle: 'Maternelle' }, { cycle: 'Primaire' }]);
      await service.definirConfiguration('ecole', {
        anneeScolaireId: 'a1',
        tousCycles: 50000,
        parCycle: [
          { cycle: 'Maternelle', montant: 30000 },
          { cycle: 'Primaire', montant: null },
        ],
      });
      expect(prisma.tarifAssurance.upsert).toHaveBeenCalledTimes(2);
      expect(prisma.tarifAssurance.upsert.mock.calls[0][0]).toMatchObject({
        create: { ecoleId: 'ecole', anneeScolaireId: 'a1', cycle: '', montant: 50000 },
        update: { montant: 50000 },
      });
      expect(prisma.tarifAssurance.deleteMany).toHaveBeenCalledWith({ where: { ecoleId: 'ecole', anneeScolaireId: 'a1', cycle: 'Primaire' } });
      await expect(service.definirConfiguration('ecole', { anneeScolaireId: 'a1', tousCycles: -5 })).rejects.toThrow(BadRequestException);
    });

    it("refuse de changer le montant d'une année clôturée", async () => {
      prisma.anneeScolaire.findUnique.mockResolvedValue({ ...ANNEE, cloturee: true });
      await expect(service.definirConfiguration('ecole', { anneeScolaireId: 'a1', tousCycles: 1000 })).rejects.toThrow('clôturée');
    });
  });

  describe('une facture par élève et par année', () => {
    it('crée la facture ASSURANCE « T-shirt 2026-2027 » au montant configuré', async () => {
      prisma.niveau.findFirst.mockResolvedValue({ cycle: 'Primaire' });
      const f = await factures.facturerAssurance('ecole', 'e1', 'a1', 'n-cp');
      expect(f).toMatchObject({ type: 'ASSURANCE', libelle: 'T-shirt 2026-2027', montantTotal: 50000, eleveId: 'e1', anneeScolaireId: 'a1' });
    });

    it("pas de doublon : rien si l'élève a déjà sa facture d'assurance (hors annulée)", async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'f-existante' });
      expect(await factures.facturerAssurance('ecole', 'e1', 'a1', 'n-cp')).toBeNull();
      expect(prisma.facture.findFirst.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole', eleveId: 'e1', anneeScolaireId: 'a1', type: 'ASSURANCE', statut: { not: 'ANNULEE' },
      });
      expect(prisma.facture.create).not.toHaveBeenCalled();
    });

    it('rien sans montant configuré, ni sur une année clôturée', async () => {
      prisma.tarifAssurance.findMany.mockResolvedValue([]);
      expect(await factures.facturerAssurance('ecole', 'e1', 'a1', 'n-cp')).toBeNull();
      prisma.tarifAssurance.findMany.mockResolvedValue(TARIFS);
      prisma.anneeScolaire.findUnique.mockResolvedValue({ ...ANNEE, cloturee: true });
      expect(await factures.facturerAssurance('ecole', 'e1', 'a1', 'n-cp')).toBeNull();
      expect(prisma.facture.create).not.toHaveBeenCalled();
    });

    it("est facturée avec les autres factures d'inscription", async () => {
      prisma.classe.findFirst.mockResolvedValue({ id: 'c1', niveauId: 'n-cp', nom: 'CP1' });
      prisma.inscription.findFirst.mockResolvedValue(null);
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
      prisma.tarifEcolage.findMany.mockResolvedValue([]);
      prisma.niveau.findFirst.mockResolvedValue({ cycle: 'Primaire' });
      await factures.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      expect(prisma.facture.create.mock.calls.map((c: any) => c[0].data.type)).toEqual(['ASSURANCE']);
    });

    it('facturation en masse : seulement les élèves non facturés, sans doublon', async () => {
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', classe: { niveauId: 'n-cp' } },
        { eleveId: 'e2', classe: { niveauId: 'n-cp' } },
      ]);
      prisma.niveau.findFirst.mockResolvedValue({ cycle: 'Primaire' });
      prisma.facture.findFirst.mockImplementation(async ({ where }: any) => (where.eleveId === 'e2' ? { id: 'deja' } : null));
      const r = await service.facturer('ecole');
      expect(r).toEqual({ anneeScolaire: '2026-2027', creees: 1, total: 50000, dejaFacturees: 1, sansMontant: 0 });
      expect(prisma.facture.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('suivi des élèves', () => {
    beforeEach(() => {
      const insc = (eleveId: string, prenom: string, cycle: string, regime = 'EXTERNAT') => ({
        eleveId,
        regime,
        eleve: { id: eleveId, prenom, nom: 'X', matricule: null, genre: 'F' },
        classe: { id: 'c', nom: cycle === 'Maternelle' ? 'PS' : 'CP1', niveau: { cycle, ordre: cycle === 'Maternelle' ? 1 : 5 } },
      });
      prisma.inscription.findMany.mockResolvedValue([
        insc('e1', 'Awa', 'Primaire'),
        insc('e2', 'Binta', 'Primaire', 'INTERNAT'),
        insc('e3', 'Coumba', 'Maternelle'),
        insc('e4', 'Dalanda', 'Primaire'),
      ]);
      prisma.facture.findMany.mockResolvedValue([
        { id: 'f1', eleveId: 'e1', montantTotal: 50000, montantPaye: 50000 },
        { id: 'f2', eleveId: 'e2', montantTotal: 50000, montantPaye: 20000 },
        { id: 'f4', eleveId: 'e4', montantTotal: 50000, montantPaye: 0 },
      ]);
    });

    it('statut par élève et totaux : attendu, payé, reste', async () => {
      const r = await service.suivi('ecole');
      expect(r.lignes.map((l) => [l.nomComplet, l.statut, l.montant, l.reste])).toEqual([
        ['Coumba X', 'NON_FACTUREE', 30000, 30000], // maternelle : montant du cycle
        ['Awa X', 'PAYEE', 50000, 0],
        ['Binta X', 'PARTIELLE', 50000, 30000],
        ['Dalanda X', 'NON_PAYEE', 50000, 50000],
      ]);
      expect(r.totaux).toMatchObject({ eleves: 4, attendu: 180000, paye: 70000, reste: 110000, payees: 1, partielles: 1, nonPayees: 1, nonFacturees: 1 });
    });

    it('filtre par statut, et par classe / régime dans la requête', async () => {
      const r = await service.suivi('ecole', { statut: 'NON_FACTUREE', classeId: 'c', regime: 'EXTERNAT' as any });
      expect(r.lignes.map((l) => l.nomComplet)).toEqual(['Coumba X']);
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({ classeId: 'c', regime: 'EXTERNAT' });
    });

    it('export Excel', async () => {
      const { buffer, nomFichier } = await service.exportXlsx('ecole', {});
      expect(nomFichier).toBe('t-shirt-2026-2027.xlsx');
      expect(buffer.length).toBeGreaterThan(1000);
    });
  });
});
