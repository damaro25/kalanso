import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AnneesScolairesService } from './annees-scolaires.service';
import { CreateAnneeScolaireDto, UpdateAnneeScolaireDto } from './dto/annee-scolaire.dto';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('AnneesScolairesService', () => {
  let prisma: any;
  let service: AnneesScolairesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new AnneesScolairesService(prisma);
    prisma.anneeScolaire.create.mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data }));
  });

  describe('create', () => {
    it('crée une année avec ses dates converties', async () => {
      const a = await service.create('ecole', { libelle: '2026-2027', dateDebut: '2026-10-01', dateFin: '2027-07-31' });
      expect(a).toMatchObject({ ecoleId: 'ecole', libelle: '2026-2027' });
      expect(a.dateDebut).toEqual(new Date('2026-10-01'));
      expect(a.dateFin).toEqual(new Date('2027-07-31'));
    });

    it('refuse une date de fin antérieure ou égale à la date de début', async () => {
      await expect(
        service.create('ecole', { libelle: '2026-2027', dateDebut: '2027-07-31', dateFin: '2026-10-01' }),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.create('ecole', { libelle: '2026-2027', dateDebut: '2026-10-01', dateFin: '2026-10-01' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.anneeScolaire.create).not.toHaveBeenCalled();
    });

    it("refuse un libellé dont la seconde année n'est pas la suivante (ex: 2028-20229, 2026-2028)", async () => {
      await expect(
        service.create('ecole', { libelle: '2026-2028', dateDebut: '2026-10-01', dateFin: '2027-07-31' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('update', () => {
    beforeEach(() =>
      prisma.anneeScolaire.findFirstOrThrow.mockResolvedValue({
        id: 'a1',
        libelle: '2026-2027',
        dateDebut: new Date('2026-10-01'),
        dateFin: new Date('2027-07-31'),
      }),
    );

    it("ne permet jamais de modifier le drapeau « courante » (seul activer() le fait, de façon exclusive)", async () => {
      await service.update('ecole', 'a1', { libelle: '2026-2027', courante: true } as any);
      expect(prisma.anneeScolaire.update.mock.calls[0][0].data).not.toHaveProperty('courante');
    });

    it('applique les mêmes contrôles de cohérence de dates', async () => {
      prisma.anneeScolaire.findFirstOrThrow.mockResolvedValue({
        id: 'a1',
        libelle: '2026-2027',
        dateDebut: new Date('2026-10-01'),
        dateFin: new Date('2027-07-31'),
      });
      await expect(service.update('ecole', 'a1', { dateFin: '2026-01-01' })).rejects.toThrow(BadRequestException);
      expect(prisma.anneeScolaire.update).not.toHaveBeenCalled();
    });

    it('convertit les dates fournies', async () => {
      prisma.anneeScolaire.findFirstOrThrow.mockResolvedValue({
        id: 'a1',
        libelle: '2026-2027',
        dateDebut: new Date('2026-10-01'),
        dateFin: new Date('2027-07-31'),
      });
      await service.update('ecole', 'a1', { dateFin: '2027-08-15' });
      expect(prisma.anneeScolaire.update.mock.calls[0][0].data.dateFin).toEqual(new Date('2027-08-15'));
    });
  });

  describe('activer', () => {
    it("désactive toutes les autres années de l'école puis active celle-ci (une seule courante)", async () => {
      prisma.anneeScolaire.findFirstOrThrow.mockResolvedValue({ id: 'a2' });

      await service.activer('ecole', 'a2');

      expect(prisma.anneeScolaire.updateMany).toHaveBeenCalledWith({ where: { ecoleId: 'ecole' }, data: { courante: false } });
      expect(prisma.anneeScolaire.update).toHaveBeenCalledWith({ where: { id: 'a2' }, data: { courante: true } });
      // l'ordre compte : on désactive avant d'activer
      expect(prisma.anneeScolaire.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.anneeScolaire.update.mock.invocationCallOrder[0],
      );
    });
  });
});

describe('DTO année scolaire (validation)', () => {
  const erreurs = async (cls: any, obj: object) => (await validate(plainToInstance(cls, obj))).map((e) => e.property);

  it("exige un libellé au format AAAA-AAAA", async () => {
    expect(await erreurs(CreateAnneeScolaireDto, { libelle: '2026-2027', dateDebut: '2026-10-01', dateFin: '2027-07-31' })).toEqual([]);
    expect(await erreurs(CreateAnneeScolaireDto, { libelle: '2028-20229', dateDebut: '2028-09-28', dateFin: '2029-06-28' })).toContain('libelle');
    expect(await erreurs(CreateAnneeScolaireDto, { libelle: 'annee 2026', dateDebut: '2026-10-01', dateFin: '2027-07-31' })).toContain('libelle');
  });

  it('exige des dates valides', async () => {
    expect(await erreurs(CreateAnneeScolaireDto, { libelle: '2026-2027', dateDebut: 'pas une date', dateFin: '2027-07-31' })).toContain('dateDebut');
  });

  it("ne déclare plus le champ « courante » dans le DTO de modification (la whitelist le retire)", async () => {
    const props = (
      await validate(plainToInstance(UpdateAnneeScolaireDto, { courante: true }), {
        whitelist: true,
        forbidNonWhitelisted: true,
      })
    ).map((e) => e.property);
    expect(props).toContain('courante'); // champ inconnu du DTO => rejeté / retiré par ValidationPipe
  });
});
