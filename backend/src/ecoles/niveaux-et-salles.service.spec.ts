import { NotFoundException } from '@nestjs/common';
import { NiveauxService } from './niveaux.service';
import { SallesService } from '../emploi-du-temps/salles.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('NiveauxService', () => {
  let prisma: any;
  let service: NiveauxService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new NiveauxService(prisma);
  });

  it("findAll liste les niveaux de l'école par ordre croissant", async () => {
    prisma.niveau.findMany.mockResolvedValue([]);
    await service.findAll('ecole');
    expect(prisma.niveau.findMany.mock.calls[0][0]).toEqual({ where: { ecoleId: 'ecole' }, orderBy: { ordre: 'asc' } });
  });

  it("create rattache le niveau à l'école", async () => {
    await service.create('ecole', { nom: '6eme', ordre: 6 } as any);
    expect(prisma.niveau.create).toHaveBeenCalledWith({ data: { ecoleId: 'ecole', nom: '6eme', ordre: 6 } });
  });

  it("update et remove refusent un niveau d'une autre école", async () => {
    prisma.niveau.findFirstOrThrow.mockRejectedValue(new NotFoundException());
    await expect(service.update('ecole', 'x', { nom: 'Y' } as any)).rejects.toThrow(NotFoundException);
    await expect(service.remove('ecole', 'x')).rejects.toThrow(NotFoundException);
    expect(prisma.niveau.update).not.toHaveBeenCalled();
    expect(prisma.niveau.delete).not.toHaveBeenCalled();
  });

  it('remove supprime un niveau de l\'école', async () => {
    prisma.niveau.findFirstOrThrow.mockResolvedValue({ id: 'n1' });
    await service.remove('ecole', 'n1');
    expect(prisma.niveau.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'n1', ecoleId: 'ecole' });
    expect(prisma.niveau.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
  });
});

describe('SallesService', () => {
  it('liste par nom et crée dans l\'école', async () => {
    const prisma: any = createPrismaMock();
    const service = new SallesService(prisma);

    prisma.salle.findMany.mockResolvedValue([]);
    await service.findAll('ecole');
    expect(prisma.salle.findMany.mock.calls[0][0]).toEqual({ where: { ecoleId: 'ecole' }, orderBy: { nom: 'asc' } });

    await service.create('ecole', { nom: 'Salle 1', capacite: 40 } as any);
    expect(prisma.salle.create).toHaveBeenCalledWith({ data: { ecoleId: 'ecole', nom: 'Salle 1', capacite: 40 } });
  });
});
