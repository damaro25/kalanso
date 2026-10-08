import { BadRequestException, NotFoundException } from '@nestjs/common';
import { MobileMoneyService } from './mobile-money.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('MobileMoneyService', () => {
  let prisma: any;
  let provider: { initier: jest.Mock };
  let service: MobileMoneyService;

  beforeEach(() => {
    prisma = createPrismaMock();
    provider = { initier: jest.fn().mockResolvedValue({ reference: 'REF-123' }) };
    service = new MobileMoneyService(prisma, provider as any);
  });

  describe('initier', () => {
    const dto = { factureId: 'f1', operateur: 'ORANGE_MONEY', telephone: '620000000', montant: 100000 } as any;

    beforeEach(() => {
      prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f1', montantTotal: 500000, montantPaye: 200000 });
      prisma.transactionMobileMoney.create.mockImplementation(async ({ data }: any) => ({ id: 't1', ...data }));
    });

    it("cloisonne la facture par école", async () => {
      await service.initier('ecole', dto, 'u1');
      expect(prisma.facture.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'f1', ecoleId: 'ecole' });
    });

    it('refuse une facture déjà soldée', async () => {
      prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f1', montantTotal: 500000, montantPaye: 500000 });
      await expect(service.initier('ecole', dto, 'u1')).rejects.toThrow('déjà soldée');
      expect(provider.initier).not.toHaveBeenCalled();
    });

    it('refuse un montant supérieur au reste à payer, sans appeler l\'opérateur', async () => {
      await expect(service.initier('ecole', { ...dto, montant: 300001 }, 'u1')).rejects.toThrow(BadRequestException);
      expect(provider.initier).not.toHaveBeenCalled();
      expect(prisma.transactionMobileMoney.create).not.toHaveBeenCalled();
    });

    it('accepte exactement le reste à payer', async () => {
      await expect(service.initier('ecole', { ...dto, montant: 300000 }, 'u1')).resolves.toBeDefined();
    });

    it("appelle l'opérateur puis enregistre la transaction avec la référence reçue", async () => {
      const t: any = await service.initier('ecole', dto, 'u1');
      expect(provider.initier).toHaveBeenCalledWith('ORANGE_MONEY', '620000000', 100000);
      expect(t).toMatchObject({
        ecoleId: 'ecole',
        factureId: 'f1',
        operateur: 'ORANGE_MONEY',
        telephone: '620000000',
        montant: 100000,
        reference: 'REF-123',
        initieeParId: 'u1',
      });
    });
  });

  describe('confirmer', () => {
    const transaction = (over: Record<string, unknown> = {}, facture: Record<string, unknown> = {}) => ({
      id: 't1',
      statut: 'EN_ATTENTE',
      montant: 100000,
      reference: 'REF-123',
      facture: { id: 'f1', montantTotal: 500000, montantPaye: 200000, ...facture },
      ...over,
    });

    beforeEach(() => {
      prisma.paiement.create.mockResolvedValue({ id: 'pay1' });
    });

    it('404 si la transaction est introuvable ou d\'une autre école', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(null);
      await expect(service.confirmer('ecole', 'x')).rejects.toThrow(NotFoundException);
      expect(prisma.transactionMobileMoney.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', ecoleId: 'ecole' });
    });

    it('refuse une transaction déjà traitée', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(transaction({ statut: 'REUSSIE' }));
      await expect(service.confirmer('ecole', 't1')).rejects.toThrow('déjà été traitée');
      expect(prisma.paiement.create).not.toHaveBeenCalled();
    });

    it('refuse si le paiement dépasserait le total de la facture (soldée entre-temps)', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(transaction({}, { montantPaye: 450000 }));
      await expect(service.confirmer('ecole', 't1')).rejects.toThrow('dépasserait');
      expect(prisma.paiement.create).not.toHaveBeenCalled();
      expect(prisma.facture.update).not.toHaveBeenCalled();
    });

    it('crée le paiement MOBILE_MONEY, passe la facture en PARTIELLE et marque la transaction REUSSIE', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(transaction());

      await service.confirmer('ecole', 't1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.paiement.create.mock.calls[0][0].data).toEqual({
        ecoleId: 'ecole',
        factureId: 'f1',
        montant: 100000,
        mode: 'MOBILE_MONEY',
        reference: 'REF-123',
      });
      expect(prisma.facture.update.mock.calls[0][0]).toEqual({
        where: { id: 'f1' },
        data: { montantPaye: 300000, statut: 'PARTIELLE' },
      });
      expect(prisma.transactionMobileMoney.update.mock.calls[0][0].data).toEqual({ statut: 'REUSSIE', paiementId: 'pay1' });
    });

    it('passe la facture en PAYEE quand le solde est atteint', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(transaction({ montant: 300000 }));
      await service.confirmer('ecole', 't1');
      expect(prisma.facture.update.mock.calls[0][0].data).toEqual({ montantPaye: 500000, statut: 'PAYEE' });
    });
  });

  describe('marquerEchec', () => {
    it('404 si introuvable', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue(null);
      await expect(service.marquerEchec('ecole', 'x')).rejects.toThrow(NotFoundException);
    });

    it('refuse une transaction déjà traitée', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue({ id: 't1', statut: 'REUSSIE' });
      await expect(service.marquerEchec('ecole', 't1')).rejects.toThrow('déjà été traitée');
      expect(prisma.transactionMobileMoney.update).not.toHaveBeenCalled();
    });

    it('marque une transaction en attente comme ECHOUEE, sans toucher à la facture', async () => {
      prisma.transactionMobileMoney.findFirst.mockResolvedValue({ id: 't1', statut: 'EN_ATTENTE' });
      await service.marquerEchec('ecole', 't1');
      expect(prisma.transactionMobileMoney.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { statut: 'ECHOUEE' } });
      expect(prisma.facture.update).not.toHaveBeenCalled();
      expect(prisma.paiement.create).not.toHaveBeenCalled();
    });
  });

  it('journal : 200 dernières transactions de l\'école', async () => {
    prisma.transactionMobileMoney.findMany.mockResolvedValue([]);
    await service.journal('ecole');
    const arg = prisma.transactionMobileMoney.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ ecoleId: 'ecole' });
    expect(arg.take).toBe(200);
    expect(arg.orderBy).toEqual({ createdAt: 'desc' });
  });
});
