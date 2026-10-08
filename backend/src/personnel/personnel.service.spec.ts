import { NotFoundException } from '@nestjs/common';
import { PersonnelService } from './personnel.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

const creneau = (over: Record<string, unknown> = {}) => ({
  classeId: 'c1',
  matiereId: 'm1',
  heureDebut: '08:00',
  heureFin: '10:00',
  tauxHoraire: 5000,
  classe: { nom: '6eme A', niveau: { nom: '6eme' } },
  matiere: { nom: 'Maths' },
  ...over,
});

describe('PersonnelService', () => {
  let prisma: any;
  let service: PersonnelService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PersonnelService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a-courante' });
  });

  describe('findAll / create / update', () => {
    it('findAll ne liste que le personnel actif de l\'école', async () => {
      prisma.personnel.findMany.mockResolvedValue([]);
      await service.findAll('ecole');
      expect(prisma.personnel.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', actif: true });
    });

    it('create applique le type ADMINISTRATIF par défaut et convertit la date d\'embauche', async () => {
      prisma.personnel.create.mockImplementation(async ({ data }: any) => data);
      const p: any = await service.create('ecole', { nom: 'Diallo', prenom: 'Fatou', dateEmbauche: '2026-09-01' } as any);
      expect(p.type).toBe('ADMINISTRATIF');
      expect(p.dateEmbauche).toEqual(new Date('2026-09-01'));
      expect(p.ecoleId).toBe('ecole');
    });

    it('update vérifie l\'appartenance à l\'école', async () => {
      prisma.personnel.findFirstOrThrow.mockRejectedValue(new NotFoundException());
      await expect(service.update('ecole', 'x', { nom: 'Y' } as any)).rejects.toThrow(NotFoundException);
      expect(prisma.personnel.update).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('désactive le membre, son compte utilisateur et libère ses créneaux, en une transaction', async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1' });
      prisma.personnel.update.mockResolvedValue({ id: 'p1', actif: false });

      const r = await service.remove('ecole', 'p1');

      expect(r).toEqual({ id: 'p1', actif: false });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.personnel.update).toHaveBeenCalledWith({ where: { id: 'p1' }, data: { actif: false } });
      expect(prisma.utilisateur.updateMany).toHaveBeenCalledWith({ where: { personnelId: 'p1' }, data: { actif: false } });
      expect(prisma.creneau.updateMany).toHaveBeenCalledWith({ where: { personnelId: 'p1' }, data: { personnelId: null } });
    });
  });

  describe('findOne', () => {
    it("n'inclut que les créneaux de l'année courante", async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1' });
      await service.findOne('ecole', 'p1');
      const arg = prisma.personnel.findFirstOrThrow.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'p1', ecoleId: 'ecole' });
      expect(arg.include.creneaux.where).toEqual({ anneeScolaireId: 'a-courante' });
    });
  });

  describe('salaireEnseignant', () => {
    beforeEach(() => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT' });
    });

    it('404 si le membre est introuvable', async () => {
      prisma.personnel.findFirst.mockResolvedValue(null);
      await expect(service.salaireEnseignant('ecole', 'x')).rejects.toThrow(NotFoundException);
    });

    it("ne prend en compte que les créneaux de l'année courante (pas de double comptage)", async () => {
      prisma.creneau.findMany.mockResolvedValue([]);
      await service.salaireEnseignant('ecole', 'p1');
      expect(prisma.creneau.findMany.mock.calls[0][0].where).toEqual({ personnelId: 'p1', anneeScolaireId: 'a-courante' });
    });

    it('calcule Σ (heures/semaine × 4 × taux horaire)', async () => {
      // 2 h + 2 h par semaine en 6eme A / Maths = 4 h/sem = 16 h/mois à 5000 = 80 000
      prisma.creneau.findMany.mockResolvedValue([creneau(), creneau({ heureDebut: '10:00', heureFin: '12:00' })]);

      const r = await service.salaireEnseignant('ecole', 'p1');

      expect(r.nombreClasses).toBe(1);
      expect(r.totalHeures).toBe(16);
      expect(r.salaireBase).toBe(80000);
      expect(r.lignes[0]).toMatchObject({ classe: '6eme A', matiere: 'Maths', heuresParMois: 16, tauxHoraire: 5000, montant: 80000 });
    });

    it('sépare les lignes par (classe, matière) et gère les demi-heures', async () => {
      prisma.creneau.findMany.mockResolvedValue([
        creneau({ heureDebut: '08:00', heureFin: '09:30' }), // 1,5 h
        creneau({ classeId: 'c2', classe: { nom: '6eme B', niveau: { nom: '6eme' } }, tauxHoraire: 4000 }), // 2 h
      ]);

      const r = await service.salaireEnseignant('ecole', 'p1');

      expect(r.nombreClasses).toBe(2);
      expect(r.totalHeures).toBe(6 + 8);
      expect(r.salaireBase).toBe(6 * 5000 + 8 * 4000);
    });

    it('reprend le taux horaire du premier créneau qui en définit un', async () => {
      prisma.creneau.findMany.mockResolvedValue([creneau({ tauxHoraire: null }), creneau({ tauxHoraire: 6000 })]);
      const r = await service.salaireEnseignant('ecole', 'p1');
      expect(r.lignes[0].tauxHoraire).toBe(6000);
    });

    it('un enseignant sans créneau a un salaire nul', async () => {
      prisma.creneau.findMany.mockResolvedValue([]);
      const r = await service.salaireEnseignant('ecole', 'p1');
      expect(r).toMatchObject({ nombreClasses: 0, totalHeures: 0, salaireBase: 0, lignes: [] });
    });
  });

  describe('baseSalarialeMensuelle', () => {
    it("pour un administratif, renvoie le salaire de base fixe", async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p2', type: 'ADMINISTRATIF', salaireBase: 250000 });
      const r = await service.baseSalarialeMensuelle('ecole', 'p2');
      expect(r).toEqual({ type: 'ADMINISTRATIF', salaireBase: 250000, totalHeures: 0 });
    });

    it('un administratif sans salaire de base renseigné vaut 0', async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p2', type: 'ADMINISTRATIF', salaireBase: null });
      expect((await service.baseSalarialeMensuelle('ecole', 'p2')).salaireBase).toBe(0);
    });

    it("pour un enseignant, déduit la base de l'emploi du temps", async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT' });
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT' });
      prisma.creneau.findMany.mockResolvedValue([creneau()]); // 2 h/sem => 8 h/mois à 5000

      const r = await service.baseSalarialeMensuelle('ecole', 'p1');

      expect(r).toEqual({ type: 'ENSEIGNANT', salaireBase: 40000, totalHeures: 8 });
    });
  });

  describe('lignesBaseEnseignant', () => {
    beforeEach(() => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1' });
      prisma.creneau.findMany.mockResolvedValue([creneau()]); // 2 h/sem => 8 h/mois
    });

    it('par défaut, heures du mois = heures hebdo × 4', async () => {
      const r = await service.lignesBaseEnseignant('ecole', 'p1');
      expect(r.lignes).toHaveLength(1);
      expect(r.lignes[0]).toMatchObject({ classeId: 'c1', matiereId: 'm1', heures: 8, taux: 5000, montant: 40000 });
      expect(r.lignes[0].libelle).toContain('Salaire base');
      expect(r.totalHeures).toBe(8);
      expect(r.total).toBe(40000);
    });

    it('les heures ajustées remplacent le défaut pour la (classe, matière) ciblée', async () => {
      const r = await service.lignesBaseEnseignant('ecole', 'p1', [{ classeId: 'c1', matiereId: 'm1', heures: 5 }]);
      expect(r.lignes[0]).toMatchObject({ heures: 5, montant: 25000 });
      expect(r.total).toBe(25000);
    });

    it('écarte les lignes à montant nul (taux horaire non défini, ou 0 heure)', async () => {
      prisma.creneau.findMany.mockResolvedValue([creneau({ tauxHoraire: null })]);
      expect((await service.lignesBaseEnseignant('ecole', 'p1')).lignes).toEqual([]);

      prisma.creneau.findMany.mockResolvedValue([creneau()]);
      const r = await service.lignesBaseEnseignant('ecole', 'p1', [{ classeId: 'c1', matiereId: 'm1', heures: 0 }]);
      expect(r.lignes).toEqual([]);
      expect(r.total).toBe(0);
    });
  });
});
