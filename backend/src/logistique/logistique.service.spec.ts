import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LogistiqueService } from './logistique.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('LogistiqueService', () => {
  let prisma: any;
  let service: LogistiqueService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new LogistiqueService(prisma);
  });

  it('findAll filtre par école et par catégorie / état / salle', async () => {
    prisma.materiel.findMany.mockResolvedValue([]);
    await service.findAll('ecole', { categorie: 'MOBILIER', etat: 'BON', salleId: 's1' });
    expect(prisma.materiel.findMany.mock.calls[0][0].where).toEqual({
      ecoleId: 'ecole',
      categorie: 'MOBILIER',
      etat: 'BON',
      salleId: 's1',
    });
  });

  it('resume totalise les quantités, globalement et par état', async () => {
    prisma.materiel.findMany.mockResolvedValue([
      { quantite: 30, etat: 'BON' },
      { quantite: 5, etat: 'BON' },
      { quantite: 4, etat: 'A_REPARER' },
    ]);
    expect(await service.resume('ecole')).toEqual({
      nombreReferences: 3,
      totalArticles: 39,
      parEtat: { BON: 35, A_REPARER: 4 },
    });
  });

  describe('create', () => {
    const dto = { categorie: 'MOBILIER', designation: 'Table-banc', quantite: 30 } as any;

    beforeEach(() => {
      prisma.materiel.create.mockImplementation(async ({ data }: any) => data);
    });

    it("l'état par défaut est BON", async () => {
      const m: any = await service.create('ecole', dto);
      expect(m).toMatchObject({ ecoleId: 'ecole', etat: 'BON', quantite: 30 });
    });

    it("refuse une salle d'une autre école", async () => {
      prisma.salle.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', { ...dto, salleId: 's-etrangere' })).rejects.toThrow(BadRequestException);
      expect(prisma.salle.findFirst.mock.calls[0][0].where).toEqual({ id: 's-etrangere', ecoleId: 'ecole' });
      expect(prisma.materiel.create).not.toHaveBeenCalled();
    });
  });

  describe('update / remove', () => {
    it('update : 404 si le matériel est introuvable', async () => {
      prisma.materiel.findFirst.mockResolvedValue(null);
      await expect(service.update('ecole', 'x', { quantite: 1 } as any)).rejects.toThrow(NotFoundException);
    });

    it('update : refuse une salle invalide', async () => {
      prisma.materiel.findFirst.mockResolvedValue({ id: 'm1' });
      prisma.salle.findFirst.mockResolvedValue(null);
      await expect(service.update('ecole', 'm1', { salleId: 's-etrangere' } as any)).rejects.toThrow('Salle invalide');
      expect(prisma.materiel.update).not.toHaveBeenCalled();
    });

    it('remove : 404 si introuvable, sinon supprime', async () => {
      prisma.materiel.findFirst.mockResolvedValueOnce(null);
      await expect(service.remove('ecole', 'x')).rejects.toThrow(NotFoundException);

      prisma.materiel.findFirst.mockResolvedValueOnce({ id: 'm1' });
      await service.remove('ecole', 'm1');
      expect(prisma.materiel.delete).toHaveBeenCalledWith({ where: { id: 'm1' } });
    });
  });
});
