import { BadRequestException } from '@nestjs/common';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { PersonnelService } from './personnel.service';

const classe = (id: string, nom: string) => ({ id, nom, niveau: { nom: '6eme' } });

describe("PersonnelService : classes d'un enseignant", () => {
  let prisma: any;
  let service: PersonnelService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PersonnelService(prisma);
    prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT' });
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    prisma.creneau.findMany.mockResolvedValue([]);
    prisma.affectationEnseignant.findMany.mockResolvedValue([]);
    prisma.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops));
  });

  describe('classesEnseignant', () => {
    it("indique pour chaque classe si elle vient de l'emploi du temps, d'une affectation ou des deux", async () => {
      prisma.creneau.findMany.mockResolvedValue([{ classe: classe('c1', '6eme A') }, { classe: classe('c1', '6eme A') }, { classe: classe('c2', '6eme B') }]);
      prisma.affectationEnseignant.findMany.mockResolvedValue([{ classe: classe('c2', '6eme B') }, { classe: classe('c3', '5eme A') }]);

      const r = await service.classesEnseignant('ecole', 'p1');

      expect(r.anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
      expect(r.classes).toEqual([
        { classeId: 'c3', nom: '5eme A', niveau: '6eme', viaEmploiDuTemps: false, affectee: true },
        { classeId: 'c1', nom: '6eme A', niveau: '6eme', viaEmploiDuTemps: true, affectee: false },
        { classeId: 'c2', nom: '6eme B', niveau: '6eme', viaEmploiDuTemps: true, affectee: true },
      ]);
    });

    it("ne considère que l'année scolaire en cours et que son école", async () => {
      await service.classesEnseignant('ecole', 'p1');
      expect(prisma.personnel.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'p1', ecoleId: 'ecole' });
      expect(prisma.creneau.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', personnelId: 'p1', anneeScolaireId: 'a1' });
      expect(prisma.affectationEnseignant.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', personnelId: 'p1', classe: { anneeScolaireId: 'a1' } });
    });

    it("sans année scolaire, renvoie une liste vide", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      expect(await service.classesEnseignant('ecole', 'p1')).toEqual({ anneeScolaire: null, classes: [] });
    });
  });

  describe('definirAffectations', () => {
    it("remplace les affectations de l'année en cours par la liste donnée", async () => {
      prisma.classe.findMany.mockResolvedValue([{ id: 'c1' }, { id: 'c2' }]);

      await service.definirAffectations('ecole', 'p1', ['c1', 'c2']);

      expect(prisma.classe.findMany.mock.calls[0][0].where).toEqual({ id: { in: ['c1', 'c2'] }, ecoleId: 'ecole', anneeScolaireId: 'a1', actif: true });
      expect(prisma.affectationEnseignant.deleteMany).toHaveBeenCalledWith({ where: { ecoleId: 'ecole', personnelId: 'p1', classe: { anneeScolaireId: 'a1' } } });
      expect(prisma.affectationEnseignant.createMany).toHaveBeenCalledWith({
        data: [
          { ecoleId: 'ecole', personnelId: 'p1', classeId: 'c1' },
          { ecoleId: 'ecole', personnelId: 'p1', classeId: 'c2' },
        ],
      });
    });

    it('une liste vide retire toutes les affectations sans en créer', async () => {
      await service.definirAffectations('ecole', 'p1', []);
      expect(prisma.affectationEnseignant.deleteMany).toHaveBeenCalled();
      expect(prisma.affectationEnseignant.createMany).not.toHaveBeenCalled();
    });

    it("refuse une classe d'une autre école ou d'une autre année, sans rien modifier", async () => {
      prisma.classe.findMany.mockResolvedValue([{ id: 'c1' }]); // c9 n'existe pas dans ce périmètre
      await expect(service.definirAffectations('ecole', 'p1', ['c1', 'c9'])).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.affectationEnseignant.deleteMany).not.toHaveBeenCalled();
      expect(prisma.affectationEnseignant.createMany).not.toHaveBeenCalled();
    });

    it("n'affecte pas de classes à un membre du personnel qui n'est pas enseignant", async () => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p2', type: 'ADMINISTRATIF' });
      await expect(service.definirAffectations('ecole', 'p2', ['c1'])).rejects.toThrow('enseignant');
      expect(prisma.affectationEnseignant.deleteMany).not.toHaveBeenCalled();
    });
  });
});
