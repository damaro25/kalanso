import { BadRequestException } from '@nestjs/common';
import { ClassesService } from './classes.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('ClassesService', () => {
  let prisma: any;
  let service: ClassesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ClassesService(prisma);
  });

  describe('findAll', () => {
    it("liste les classes actives de l'école, toutes années confondues, les plus récentes d'abord", async () => {
      prisma.classe.findMany.mockResolvedValue([]);
      await service.findAll('ecole');
      const arg = prisma.classe.findMany.mock.calls[0][0];
      expect(arg.where).toEqual({ ecoleId: 'ecole', actif: true });
      expect(arg.orderBy[0]).toEqual({ anneeScolaire: { dateDebut: 'desc' } });
      expect(prisma.anneeScolaire.findFirst).not.toHaveBeenCalled();
    });

    describe('avec courante : uniquement les classes de l\'année en cours (filtres et sélecteurs)', () => {
      beforeEach(() => {
        prisma.classe.findMany.mockResolvedValue([]);
      });

      it("se limite à l'année scolaire courante", async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValueOnce({ id: 'a-courante' });

        await service.findAll('ecole', { courante: true });

        expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', courante: true });
        expect(prisma.classe.findMany.mock.calls[0][0].where).toEqual({
          ecoleId: 'ecole',
          actif: true,
          anneeScolaireId: 'a-courante',
        });
      });

      it("à défaut d'année courante, retombe sur la plus récente", async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a-recente' });

        await service.findAll('ecole', { courante: true });

        expect(prisma.anneeScolaire.findFirst.mock.calls[1][0].orderBy).toEqual({ dateDebut: 'desc' });
        expect(prisma.classe.findMany.mock.calls[0][0].where.anneeScolaireId).toBe('a-recente');
      });

      it("renvoie une liste vide sans chercher de classes quand l'école n'a aucune année", async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValue(null);
        expect(await service.findAll('ecole', { courante: true })).toEqual([]);
        expect(prisma.classe.findMany).not.toHaveBeenCalled();
      });

      it('cloisonne la recherche de l\'année par école', async () => {
        prisma.anneeScolaire.findFirst.mockResolvedValueOnce({ id: 'a1' });
        await service.findAll('autre-ecole', { courante: true });
        expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where.ecoleId).toBe('autre-ecole');
        expect(prisma.classe.findMany.mock.calls[0][0].where.ecoleId).toBe('autre-ecole');
      });
    });
  });

  describe('create', () => {
    it("crée la classe quand le niveau et l'année appartiennent à l'école", async () => {
      prisma.niveau.findFirst.mockResolvedValue({ id: 'n1' });
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.classe.create.mockImplementation(async ({ data }: any) => ({ id: 'c1', ...data }));

      const c = await service.create('ecole', { nom: '5eme A', niveauId: 'n1', anneeScolaireId: 'a1', capaciteMax: 40 });

      expect(c).toMatchObject({ ecoleId: 'ecole', nom: '5eme A', niveauId: 'n1', anneeScolaireId: 'a1', capaciteMax: 40 });
      expect(prisma.niveau.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', ecoleId: 'ecole' });
      expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ id: 'a1', ecoleId: 'ecole' });
    });

    it("refuse un niveau d'une autre école (isolation multi-école)", async () => {
      prisma.niveau.findFirst.mockResolvedValue(null);
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      await expect(
        service.create('ecole', { nom: 'X', niveauId: 'niveau-etranger', anneeScolaireId: 'a1' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.classe.create).not.toHaveBeenCalled();
    });

    it("refuse une année scolaire d'une autre école", async () => {
      prisma.niveau.findFirst.mockResolvedValue({ id: 'n1' });
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(
        service.create('ecole', { nom: 'X', niveauId: 'n1', anneeScolaireId: 'annee-etrangere' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.classe.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it("vérifie l'appartenance à l'école puis met à jour", async () => {
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1' });
      await service.update('ecole', 'c1', { nom: 'Nouveau' });
      expect(prisma.classe.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'c1', ecoleId: 'ecole' });
      expect(prisma.classe.update.mock.calls[0][0]).toEqual({ where: { id: 'c1' }, data: { nom: 'Nouveau' } });
    });
  });

  describe('remove', () => {
    beforeEach(() => {
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1' });
    });

    it("refuse de supprimer une classe qui a (ou a eu) des inscrits, quel que soit leur statut", async () => {
      prisma.inscription.count.mockResolvedValue(3);

      await expect(service.remove('ecole', 'c1')).rejects.toThrow(BadRequestException);

      // aucun filtre de statut : même une inscription TERMINEE/ABANDONNEE bloque la suppression
      expect(prisma.inscription.count.mock.calls[0][0].where).toEqual({ classeId: 'c1' });
      expect(prisma.classe.delete).not.toHaveBeenCalled();
      expect(prisma.creneau.deleteMany).not.toHaveBeenCalled();
    });

    it("supprime la classe vide et ses créneaux d'emploi du temps, en une transaction", async () => {
      prisma.inscription.count.mockResolvedValue(0);

      await service.remove('ecole', 'c1');

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.creneau.deleteMany).toHaveBeenCalledWith({ where: { classeId: 'c1' } });
      expect(prisma.classe.delete).toHaveBeenCalledWith({ where: { id: 'c1' } });
    });
  });

  describe('eleves', () => {
    it("renvoie les élèves des inscriptions EN_COURS de la classe", async () => {
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1' });
      prisma.inscription.findMany.mockResolvedValue([{ eleve: { id: 'e1' } }, { eleve: { id: 'e2' } }]);

      const r = await service.eleves('ecole', 'c1');

      expect(r).toEqual([{ id: 'e1' }, { id: 'e2' }]);
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({ classeId: 'c1', statut: 'EN_COURS' });
    });
  });

  describe('effectifs', () => {
    it('calcule filles/garçons/total, frais d\'inscription et écolage cumulé par niveau et année', async () => {
      prisma.classe.findMany.mockResolvedValue([
        {
          id: 'c1',
          nom: '5eme A',
          niveauId: 'n5',
          anneeScolaireId: 'a1',
          capaciteMax: 40,
          niveau: { nom: '5eme' },
          anneeScolaire: { libelle: '2026-2027' },
          inscriptions: [{ eleve: { genre: 'F' } }, { eleve: { genre: 'F' } }, { eleve: { genre: 'M' } }],
        },
        {
          id: 'c2',
          nom: '6eme A',
          niveauId: 'n6',
          anneeScolaireId: 'a1',
          capaciteMax: null,
          niveau: { nom: '6eme' },
          anneeScolaire: { libelle: '2026-2027' },
          inscriptions: [],
        },
      ]);
      prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([{ niveauId: 'n5', anneeScolaireId: 'a1', montant: 75000 }]);
      prisma.tarifEcolage.findMany.mockResolvedValue([
        { niveauId: 'n5', anneeScolaireId: 'a1', montant: 500000 },
        { niveauId: 'n5', anneeScolaireId: 'a1', montant: 250000 },
        { niveauId: 'n5', anneeScolaireId: 'autre', montant: 1 }, // autre année : ignoré
      ]);

      const [c1, c2] = await service.effectifs('ecole');

      expect(c1).toMatchObject({
        classeId: 'c1',
        niveau: '5eme',
        anneeScolaire: '2026-2027',
        capaciteMax: 40,
        filles: 2,
        garcons: 1,
        total: 3,
        fraisInscription: 75000,
        ecolage: 750000, // somme de tous les tarifs du niveau pour l'année
      });
      expect(c2).toMatchObject({ total: 0, fraisInscription: 0, ecolage: 0 });
    });
  });
});
