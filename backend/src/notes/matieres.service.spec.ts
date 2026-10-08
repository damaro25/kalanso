import { BadRequestException } from '@nestjs/common';
import { MatieresService } from './matieres.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('MatieresService', () => {
  let prisma: any;
  let service: MatieresService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new MatieresService(prisma);
    prisma.niveau.findFirst.mockResolvedValue({ id: 'n1' });
    prisma.matiere.create.mockImplementation(async ({ data }: any) => ({ ...data }));
  });

  it('findAll filtre par école et, si fourni, par niveau', async () => {
    prisma.matiere.findMany.mockResolvedValue([]);
    await service.findAll('ecole', 'n1');
    expect(prisma.matiere.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', niveauId: 'n1' });
  });

  describe('create', () => {
    const dto = { niveauId: 'n1', nom: 'Maths', coefficient: 3 };

    it('crée la matière dans le niveau de l\'école', async () => {
      const m = await service.create('ecole', dto);
      expect(m).toMatchObject({ ecoleId: 'ecole', niveauId: 'n1', nom: 'Maths', coefficient: 3 });
      expect(prisma.niveau.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', ecoleId: 'ecole' });
    });

    it("refuse un niveau d'une autre école", async () => {
      prisma.niveau.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.matiere.create).not.toHaveBeenCalled();
    });

    it('rejeu hors-ligne : renvoie la matière déjà créée sans la recréer', async () => {
      const existante = { id: 'm-client', ecoleId: 'ecole', nom: 'Maths' };
      prisma.matiere.findFirst.mockResolvedValue(existante);

      const m = await service.create('ecole', { ...dto, id: 'm-client' });

      expect(m).toBe(existante);
      expect(prisma.matiere.create).not.toHaveBeenCalled();
    });

    it("le rejeu est cloisonné par école : l'id d'une autre école n'est jamais renvoyé", async () => {
      prisma.matiere.findFirst.mockResolvedValue(null);

      await service.create('ecole', { ...dto, id: 'm-autre-ecole' });

      expect(prisma.matiere.findFirst.mock.calls[0][0].where).toEqual({ id: 'm-autre-ecole', ecoleId: 'ecole' });
      expect(prisma.matiere.create).toHaveBeenCalled();
    });
  });

  describe('update / remove', () => {
    it("vérifient l'appartenance à l'école avant d'écrire", async () => {
      prisma.matiere.findFirstOrThrow.mockResolvedValue({ id: 'm1' });
      await service.update('ecole', 'm1', { nom: 'Algèbre' });
      await service.remove('ecole', 'm1');
      expect(prisma.matiere.findFirstOrThrow.mock.calls.map((c: any) => c[0].where)).toEqual([
        { id: 'm1', ecoleId: 'ecole' },
        { id: 'm1', ecoleId: 'ecole' },
      ]);
      expect(prisma.matiere.update.mock.calls[0][0].data).toEqual({ nom: 'Algèbre' });
      expect(prisma.matiere.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
