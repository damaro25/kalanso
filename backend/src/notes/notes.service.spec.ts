import { BadRequestException } from '@nestjs/common';
import { NotesService } from './notes.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('NotesService', () => {
  let prisma: any;
  let service: NotesService;

  const dto = (entries: any[]) => ({ classeId: 'c1', trimestre: 2, entries }) as any;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new NotesService(prisma);
    prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1', niveauId: 'n1', anneeScolaireId: 'a1' });
    prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }, { eleveId: 'e2' }]);
    prisma.matiere.findMany.mockResolvedValue([{ id: 'm1', niveauId: 'n1' }]);
    prisma.note.upsert.mockImplementation((arg: any) => arg);
  });

  describe('saisir', () => {
    it("n'accepte que des élèves inscrits EN_COURS dans cette classe pour son année", async () => {
      await service.saisir('ecole', dto([{ eleveId: 'e1', matiereId: 'm1', valeur: 8 }]));
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        classeId: 'c1',
        anneeScolaireId: 'a1',
        statut: 'EN_COURS',
        eleveId: { in: ['e1'] },
      });
    });

    it('refuse une note pour un élève hors de la classe, sans rien écrire', async () => {
      await expect(
        service.saisir(
          'ecole',
          dto([
            { eleveId: 'e1', matiereId: 'm1', valeur: 8 },
            { eleveId: 'e-etranger', matiereId: 'm1', valeur: 5 },
          ]),
        ),
      ).rejects.toThrow(/1 élève\(s\) ne sont pas inscrit/);
      expect(prisma.note.upsert).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuse une matière d'un autre niveau que celui de la classe", async () => {
      prisma.matiere.findMany.mockResolvedValue([{ id: 'm1', niveauId: 'autre-niveau' }]);
      await expect(service.saisir('ecole', dto([{ eleveId: 'e1', matiereId: 'm1', valeur: 8 }]))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.note.upsert).not.toHaveBeenCalled();
    });

    it('refuse une matière inexistante ou d\'une autre école', async () => {
      prisma.matiere.findMany.mockResolvedValue([]);
      await expect(service.saisir('ecole', dto([{ eleveId: 'e1', matiereId: 'm-fantome', valeur: 8 }]))).rejects.toThrow(
        "Une matière ne correspond pas au niveau",
      );
    });

    it("cloisonne la recherche des matières par école", async () => {
      await service.saisir('ecole', dto([{ eleveId: 'e1', matiereId: 'm1', valeur: 8 }]));
      expect(prisma.matiere.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', id: { in: ['m1'] } });
    });

    it('upsert une note par entrée dans une seule transaction, et rattache la note à la classe y compris en mise à jour', async () => {
      await service.saisir(
        'ecole',
        dto([
          { eleveId: 'e1', matiereId: 'm1', valeur: 8, appreciation: 'Bien' },
          { eleveId: 'e2', matiereId: 'm1', valeur: 6 },
        ]),
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.note.upsert).toHaveBeenCalledTimes(2);

      const premier = prisma.note.upsert.mock.calls[0][0];
      expect(premier.where).toEqual({
        eleveId_matiereId_anneeScolaireId_trimestre: { eleveId: 'e1', matiereId: 'm1', anneeScolaireId: 'a1', trimestre: 2 },
      });
      expect(premier.update).toEqual({ valeur: 8, appreciation: 'Bien', classeId: 'c1' });
      expect(premier.create).toMatchObject({
        ecoleId: 'ecole',
        eleveId: 'e1',
        classeId: 'c1',
        matiereId: 'm1',
        anneeScolaireId: 'a1',
        trimestre: 2,
        valeur: 8,
      });
    });
  });

  describe('findByClasseTrimestre', () => {
    it("vérifie la classe puis liste les notes du trimestre", async () => {
      prisma.note.findMany.mockResolvedValue([]);
      await service.findByClasseTrimestre('ecole', 'c1', 3);
      expect(prisma.classe.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'c1', ecoleId: 'ecole' });
      expect(prisma.note.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', classeId: 'c1', trimestre: 3 });
    });
  });
});
