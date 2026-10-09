import { ForbiddenException } from '@nestjs/common';
import { createPrismaMock } from '../../../test/helpers/prisma-mock';
import { PerimetreService } from './perimetre.service';

const enseignant = { userId: 'u1', ecoleId: 'ecole', role: 'ENSEIGNANT', email: 'e@x.gn', personnelId: 'p1' };
const comme = (role: string) => ({ ...enseignant, role });

describe('PerimetreService : classes et élèves accessibles', () => {
  let prisma: any;
  let service: PerimetreService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PerimetreService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.creneau.findMany.mockResolvedValue([]);
    prisma.affectationEnseignant.findMany.mockResolvedValue([]);
  });

  describe('qui est restreint', () => {
    it.each(['FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE', 'COMPTABLE'])('%s n\'a aucune restriction', async (role) => {
      expect(service.estRestreint(comme(role))).toBe(false);
      expect(await service.classesAutorisees(comme(role))).toBeNull();
      await expect(service.exigerClasse(comme(role), 'n-importe-laquelle')).resolves.toBeUndefined();
      await expect(service.exigerEleve(comme(role), 'n-importe-lequel')).resolves.toBeUndefined();
      expect(prisma.creneau.findMany).not.toHaveBeenCalled(); // aucune requête inutile
    });

    it("l'enseignant est restreint", () => {
      expect(service.estRestreint(enseignant)).toBe(true);
    });
  });

  describe('classesAutorisees (enseignant)', () => {
    it("réunit les classes de son emploi du temps et celles qui lui sont affectées, sans doublon", async () => {
      prisma.creneau.findMany.mockResolvedValue([{ classeId: 'c1' }, { classeId: 'c1' }, { classeId: 'c2' }]);
      prisma.affectationEnseignant.findMany.mockResolvedValue([{ classeId: 'c2' }, { classeId: 'c3' }]);

      const classes = await service.classesAutorisees(enseignant);

      expect(classes?.sort()).toEqual(['c1', 'c2', 'c3']);
    });

    it("ne regarde que son école, sa fiche de personnel et l'année en cours", async () => {
      await service.classesAutorisees(enseignant);

      expect(prisma.creneau.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', personnelId: 'p1', anneeScolaireId: 'a1' });
      expect(prisma.affectationEnseignant.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        personnelId: 'p1',
        classe: { anneeScolaireId: 'a1' },
      });
    });

    it("à défaut d'année courante, retient la plus récente", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a-recente' });
      await service.classesAutorisees(enseignant);
      expect(prisma.creneau.findMany.mock.calls[0][0].where.anneeScolaireId).toBe('a-recente');
    });

    it("un compte enseignant relié à aucune fiche du personnel n'a accès à aucune classe", async () => {
      expect(await service.classesAutorisees({ ...enseignant, personnelId: null })).toEqual([]);
      expect(await service.classesAutorisees({ ...enseignant, personnelId: undefined })).toEqual([]);
      expect(prisma.creneau.findMany).not.toHaveBeenCalled();
    });

    it("sans aucune année scolaire, n'a accès à rien", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      expect(await service.classesAutorisees(enseignant)).toEqual([]);
    });
  });

  describe('exigerClasse', () => {
    beforeEach(() => prisma.creneau.findMany.mockResolvedValue([{ classeId: 'c1' }]));

    it('laisse passer une de ses classes', async () => {
      await expect(service.exigerClasse(enseignant, 'c1')).resolves.toBeUndefined();
    });

    it("refuse la classe d'un autre enseignant", async () => {
      await expect(service.exigerClasse(enseignant, 'c9')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("refuse quand aucune classe n'est précisée", async () => {
      await expect(service.exigerClasse(enseignant, undefined)).rejects.toBeInstanceOf(ForbiddenException);
      await expect(service.exigerClasse(enseignant, '')).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('exigerEleve', () => {
    it('laisse passer un élève inscrit dans une de ses classes', async () => {
      prisma.creneau.findMany.mockResolvedValue([{ classeId: 'c1' }]);
      prisma.inscription.findFirst.mockResolvedValue({ id: 'i1' });

      await expect(service.exigerEleve(enseignant, 'e1')).resolves.toBeUndefined();

      expect(prisma.inscription.findFirst.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        eleveId: 'e1',
        statut: 'EN_COURS',
        classeId: { in: ['c1'] },
      });
    });

    it("refuse un élève qui n'est inscrit dans aucune de ses classes", async () => {
      prisma.creneau.findMany.mockResolvedValue([{ classeId: 'c1' }]);
      prisma.inscription.findFirst.mockResolvedValue(null);
      await expect(service.exigerEleve(enseignant, 'e9')).rejects.toBeInstanceOf(ForbiddenException);
    });

    it("sans classe, refuse sans même interroger les inscriptions", async () => {
      await expect(service.exigerEleve(enseignant, 'e1')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.inscription.findFirst).not.toHaveBeenCalled();
    });
  });
});
