import { BadRequestException } from '@nestjs/common';
import { TarifsEcolageService } from './tarifs-ecolage.service';
import { FraisInscriptionNiveauService } from './frais-inscription-niveau.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('TarifsEcolageService', () => {
  let prisma: any;
  let service: TarifsEcolageService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new TarifsEcolageService(prisma);
    prisma.niveau.findFirst.mockResolvedValue({ id: 'n1' });
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.tarifEcolage.create.mockImplementation(async ({ data }: any) => ({ id: 't1', ...data }));
  });

  it("findAll rattache le libellé de l'année à chaque tarif (simple champ, pas de relation)", async () => {
    prisma.tarifEcolage.findMany.mockResolvedValue([
      { id: 't1', anneeScolaireId: 'a1' },
      { id: 't2', anneeScolaireId: 'inconnue' },
    ]);
    prisma.anneeScolaire.findMany.mockResolvedValue([{ id: 'a1', libelle: '2026-2027' }]);

    const r = await service.findAll('ecole');

    expect(r[0].anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
    expect(r[1].anneeScolaire).toBeNull();
  });

  describe('create', () => {
    const dto = { niveauId: 'n1', anneeScolaireId: 'a1', libelle: 'Écolage T1', montant: 300000 };

    it("crée le tarif quand le niveau et l'année appartiennent à l'école", async () => {
      const t = await service.create('ecole', dto);
      expect(t).toMatchObject({ ecoleId: 'ecole', niveauId: 'n1', anneeScolaireId: 'a1', libelle: 'Écolage T1', montant: 300000 });
      expect(prisma.niveau.findFirst.mock.calls[0][0].where).toEqual({ id: 'n1', ecoleId: 'ecole' });
      expect(prisma.anneeScolaire.findFirst.mock.calls[0][0].where).toEqual({ id: 'a1', ecoleId: 'ecole' });
    });

    it("refuse un niveau d'une autre école", async () => {
      prisma.niveau.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow('Niveau invalide');
      expect(prisma.tarifEcolage.create).not.toHaveBeenCalled();
    });

    it("refuse une année d'une autre école", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow('Année scolaire invalide');
      expect(prisma.tarifEcolage.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.tarifEcolage.findFirstOrThrow.mockResolvedValue({ id: 't1' });
    });

    it("met à jour libellé et montant sans toucher aux références", async () => {
      await service.update('ecole', 't1', { montant: 350000 });
      expect(prisma.anneeScolaire.findFirst).not.toHaveBeenCalled();
      expect(prisma.tarifEcolage.update.mock.calls[0][0]).toMatchObject({ where: { id: 't1' }, data: { montant: 350000 } });
    });

    it("refuse de déplacer le tarif vers l'année d'une autre école", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.update('ecole', 't1', { anneeScolaireId: 'etrangere' })).rejects.toThrow(BadRequestException);
      expect(prisma.tarifEcolage.update).not.toHaveBeenCalled();
    });
  });
});

describe('FraisInscriptionNiveauService', () => {
  let prisma: any;
  let service: FraisInscriptionNiveauService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FraisInscriptionNiveauService(prisma);
    prisma.niveau.findFirst.mockResolvedValue({ id: 'n1' });
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
    prisma.fraisInscriptionNiveau.create.mockImplementation(async ({ data }: any) => ({ id: 'f1', ...data }));
  });

  describe('create', () => {
    const dto = { niveauId: 'n1', anneeScolaireId: 'a1', montant: 75000, montantReinscription: 50000 };

    it('crée les frais (inscription + réinscription) pour le niveau et l\'année', async () => {
      const f = await service.create('ecole', dto);
      expect(f).toMatchObject({ ecoleId: 'ecole', niveauId: 'n1', anneeScolaireId: 'a1', montant: 75000, montantReinscription: 50000 });
    });

    it('refuse un doublon niveau + année', async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ id: 'existant' });
      await expect(service.create('ecole', dto)).rejects.toThrow('déjà défini');
      expect(prisma.fraisInscriptionNiveau.create).not.toHaveBeenCalled();
    });

    it("refuse un niveau d'une autre école", async () => {
      prisma.niveau.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow('Niveau invalide');
      expect(prisma.fraisInscriptionNiveau.create).not.toHaveBeenCalled();
    });

    it("refuse une année d'une autre école", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto)).rejects.toThrow('Année scolaire invalide');
      expect(prisma.fraisInscriptionNiveau.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    beforeEach(() => {
      prisma.fraisInscriptionNiveau.findFirstOrThrow.mockResolvedValue({ id: 'f1', niveauId: 'n1', anneeScolaireId: 'a1' });
    });

    it('met à jour les montants', async () => {
      await service.update('ecole', 'f1', { montant: 80000 });
      expect(prisma.fraisInscriptionNiveau.update.mock.calls[0][0].data).toMatchObject({ montant: 80000 });
    });

    it("refuse de passer sur une année qui a déjà un montant pour ce niveau", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ id: 'autre' });
      await expect(service.update('ecole', 'f1', { anneeScolaireId: 'a2' })).rejects.toThrow('déjà défini');
      expect(prisma.fraisInscriptionNiveau.update).not.toHaveBeenCalled();
    });

    it("refuse de passer sur l'année d'une autre école", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.update('ecole', 'f1', { anneeScolaireId: 'etrangere' })).rejects.toThrow('Année scolaire invalide');
      expect(prisma.fraisInscriptionNiveau.update).not.toHaveBeenCalled();
    });

    it("ne revalide pas l'année quand elle n'a pas changé", async () => {
      await service.update('ecole', 'f1', { anneeScolaireId: 'a1', montant: 1 });
      expect(prisma.anneeScolaire.findFirst).not.toHaveBeenCalled();
    });
  });
});
