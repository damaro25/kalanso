import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploiDuTempsService } from './emploi-du-temps.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('EmploiDuTempsService', () => {
  let prisma: any;
  let service: EmploiDuTempsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new EmploiDuTempsService(prisma);
  });

  describe('findByPersonnel', () => {
    beforeEach(() => {
      prisma.personnel.findFirstOrThrow.mockResolvedValue({ id: 'p1' });
      prisma.creneau.findMany.mockResolvedValue([]);
    });

    it("ne renvoie que les créneaux de l'année scolaire courante", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce({ id: 'a-courante' });

      await service.findByPersonnel('ecole', 'p1');

      expect(prisma.creneau.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        personnelId: 'p1',
        anneeScolaireId: 'a-courante',
      });
    });

    it("à défaut d'année courante, retombe sur la plus récente", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a-recente' });

      await service.findByPersonnel('ecole', 'p1');

      expect(prisma.anneeScolaire.findFirst.mock.calls[1][0].orderBy).toEqual({ dateDebut: 'desc' });
      expect(prisma.creneau.findMany.mock.calls[0][0].where.anneeScolaireId).toBe('a-recente');
    });

    it("refuse un membre du personnel d'une autre école", async () => {
      prisma.personnel.findFirstOrThrow.mockRejectedValue(new NotFoundException());
      await expect(service.findByPersonnel('ecole', 'etranger')).rejects.toThrow(NotFoundException);
      expect(prisma.creneau.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    const dto = {
      classeId: 'c1',
      matiereId: 'm1',
      personnelId: 'p1',
      salleId: 's1',
      jour: 'LUNDI',
      heureDebut: '08:00',
      heureFin: '09:00',
    } as any;

    beforeEach(() => {
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1', niveauId: 'n1', anneeScolaireId: 'a1' });
      prisma.matiere.findFirstOrThrow.mockResolvedValue({ id: 'm1', niveauId: 'n1' });
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', actif: true });
      prisma.salle.findFirstOrThrow.mockResolvedValue({ id: 's1' });
      prisma.creneau.findMany.mockResolvedValue([]);
      prisma.creneau.create.mockImplementation(async ({ data }: any) => ({ id: 'cr1', ...data }));
    });

    it.each([
      ['une heure de fin égale au début', '08:00', '08:00'],
      ['une heure de fin avant le début', '10:00', '09:00'],
    ])('refuse %s', async (_nom, debut, fin) => {
      await expect(service.create('ecole', { ...dto, heureDebut: debut, heureFin: fin })).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.creneau.create).not.toHaveBeenCalled();
    });

    it("refuse une matière qui n'appartient pas au niveau de la classe", async () => {
      prisma.matiere.findFirstOrThrow.mockResolvedValue({ id: 'm1', niveauId: 'autre-niveau' });
      await expect(service.create('ecole', dto)).rejects.toThrow("n'appartient pas au niveau");
      expect(prisma.creneau.create).not.toHaveBeenCalled();
    });

    it('refuse un enseignant introuvable (404)', async () => {
      prisma.personnel.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow(NotFoundException);
    });

    it('refuse un enseignant inactif', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', actif: false });
      await expect(service.create('ecole', dto)).rejects.toThrow("n'est plus actif");
      expect(prisma.creneau.create).not.toHaveBeenCalled();
    });

    it('crée le créneau, rattaché à l\'année scolaire de la classe', async () => {
      const c = await service.create('ecole', dto);
      expect(c).toMatchObject({
        ecoleId: 'ecole',
        classeId: 'c1',
        matiereId: 'm1',
        personnelId: 'p1',
        salleId: 's1',
        anneeScolaireId: 'a1',
        jour: 'LUNDI',
        heureDebut: '08:00',
        heureFin: '09:00',
      });
    });

    it('cherche les conflits sur le même jour et la même année seulement', async () => {
      await service.create('ecole', dto);
      const where = prisma.creneau.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({ ecoleId: 'ecole', jour: 'LUNDI', anneeScolaireId: 'a1' });
      expect(where.OR).toEqual([{ salleId: 's1' }, { personnelId: 'p1' }]);
    });

    it("refuse une salle déjà occupée sur un intervalle qui se chevauche", async () => {
      prisma.creneau.findMany.mockResolvedValue([
        { salleId: 's1', personnelId: 'autre', heureDebut: '08:30', heureFin: '09:30', classe: { nom: '6eme A' }, salle: { nom: 'S1' } },
      ]);
      await expect(service.create('ecole', dto)).rejects.toThrow(/salle S1 est déjà occupée par 6eme A/);
      expect(prisma.creneau.create).not.toHaveBeenCalled();
    });

    it('refuse un enseignant déjà occupé, même dans une autre salle', async () => {
      prisma.creneau.findMany.mockResolvedValue([
        { salleId: 'autre-salle', personnelId: 'p1', heureDebut: '07:30', heureFin: '08:30', classe: { nom: '5eme B' }, salle: { nom: 'S2' } },
      ]);
      await expect(service.create('ecole', dto)).rejects.toThrow(/l'enseignant est déjà occupé avec 5eme B/);
    });

    it('accepte des créneaux consécutifs (fin = début suivant)', async () => {
      prisma.creneau.findMany.mockResolvedValue([
        { salleId: 's1', personnelId: 'p1', heureDebut: '07:00', heureFin: '08:00', classe: { nom: 'X' }, salle: { nom: 'S1' } },
        { salleId: 's1', personnelId: 'p1', heureDebut: '09:00', heureFin: '10:00', classe: { nom: 'X' }, salle: { nom: 'S1' } },
      ]);
      await expect(service.create('ecole', dto)).resolves.toBeDefined();
    });

    it('sans salle ni enseignant, ne cherche aucun conflit', async () => {
      await service.create('ecole', { ...dto, salleId: undefined, personnelId: undefined });
      expect(prisma.creneau.findMany).not.toHaveBeenCalled();
      expect(prisma.creneau.create).toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('supprime un créneau de l\'école', async () => {
      prisma.creneau.findFirst.mockResolvedValue({ id: 'cr1' });
      await service.remove('ecole', 'cr1');
      expect(prisma.creneau.findFirst.mock.calls[0][0].where).toEqual({ id: 'cr1', ecoleId: 'ecole' });
      expect(prisma.creneau.delete).toHaveBeenCalledWith({ where: { id: 'cr1' } });
    });

    it('404 si le créneau est introuvable ou d\'une autre école', async () => {
      prisma.creneau.findFirst.mockResolvedValue(null);
      await expect(service.remove('ecole', 'x')).rejects.toThrow(NotFoundException);
      expect(prisma.creneau.delete).not.toHaveBeenCalled();
    });
  });
});
