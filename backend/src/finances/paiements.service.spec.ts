import { BadRequestException } from '@nestjs/common';
import { PaiementsService } from './paiements.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('PaiementsService.create', () => {
  let prisma: any;
  let service: PaiementsService;

  const facture = (montantTotal: number, montantPaye: number) => ({ id: 'f1', montantTotal, montantPaye });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaiementsService(prisma);
    prisma.paiement.create.mockImplementation(async ({ data }: any) => ({ id: 'p1', ...data }));
  });

  it("un paiement partiel passe la facture en PARTIELLE et cumule le montant payé", async () => {
    prisma.facture.findFirstOrThrow.mockResolvedValue(facture(500000, 0));

    const p = await service.create('ecole', { factureId: 'f1', montant: 200000, mode: 'ESPECES' } as any, 'u1');

    expect(p).toMatchObject({ factureId: 'f1', montant: 200000, saisieParId: 'u1', ecoleId: 'ecole' });
    expect(prisma.facture.update.mock.calls[0][0]).toMatchObject({
      where: { id: 'f1' },
      data: { montantPaye: 200000, statut: 'PARTIELLE' },
    });
  });

  it('le paiement du solde exact passe la facture en PAYEE', async () => {
    prisma.facture.findFirstOrThrow.mockResolvedValue(facture(500000, 200000));

    await service.create('ecole', { factureId: 'f1', montant: 300000 } as any, 'u1');

    expect(prisma.facture.update.mock.calls[0][0].data).toEqual({ montantPaye: 500000, statut: 'PAYEE' });
  });

  it('refuse un paiement qui dépasserait le montant total (aucune écriture)', async () => {
    prisma.facture.findFirstOrThrow.mockResolvedValue(facture(500000, 450000));

    await expect(service.create('ecole', { factureId: 'f1', montant: 60000 } as any, 'u1')).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.paiement.create).not.toHaveBeenCalled();
    expect(prisma.facture.update).not.toHaveBeenCalled();
  });

  it('refuse tout nouveau paiement sur une facture déjà soldée', async () => {
    prisma.facture.findFirstOrThrow.mockResolvedValue(facture(100000, 100000));
    await expect(service.create('ecole', { factureId: 'f1', montant: 1 } as any, 'u1')).rejects.toThrow(
      'dépasserait',
    );
  });

  it("isole par école : la facture est cherchée avec l'ecoleId de l'utilisateur", async () => {
    prisma.facture.findFirstOrThrow.mockResolvedValue(facture(100, 0));
    await service.create('ecole-A', { factureId: 'f1', montant: 10 } as any, 'u1');
    expect(prisma.facture.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'f1', ecoleId: 'ecole-A' });
  });

  describe('idempotence (rejeu hors-ligne)', () => {
    it("renvoie le paiement existant sans rien recréer quand l'id est déjà connu", async () => {
      prisma.paiement.findUnique.mockResolvedValue({ id: 'deja', montant: 5000 });

      const r = await service.create('ecole', { id: 'deja', factureId: 'f1', montant: 5000 } as any, 'u1');

      expect(r).toEqual({ id: 'deja', montant: 5000 });
      expect(prisma.facture.findFirstOrThrow).not.toHaveBeenCalled();
      expect(prisma.paiement.create).not.toHaveBeenCalled();
      expect(prisma.facture.update).not.toHaveBeenCalled();
    });

    it("crée le paiement avec l'id fourni par le client quand il est nouveau", async () => {
      prisma.paiement.findUnique.mockResolvedValue(null);
      prisma.facture.findFirstOrThrow.mockResolvedValue(facture(100000, 0));

      await service.create('ecole', { id: 'client-uuid', factureId: 'f1', montant: 1000 } as any, 'u1');

      expect(prisma.paiement.create.mock.calls[0][0].data.id).toBe('client-uuid');
    });
  });
});
