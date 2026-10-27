import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PaiementsService } from './paiements.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('PaiementsService.annuler', () => {
  let prisma: any;
  let service: PaiementsService;

  const facture = (id: string, libelle: string, montantTotal: number, montantPaye: number, extra: any = {}) => ({
    id,
    libelle,
    type: 'ECOLAGE',
    statut: montantPaye >= montantTotal ? 'PAYEE' : 'PARTIELLE',
    eleveId: 'e1',
    anneeScolaireId: 'a1',
    dateEcheance: null,
    montantTotal,
    montantPaye,
    ...extra,
  });
  const paiement = (id: string, f: any, montant: number, extra: any = {}) => ({
    id,
    factureId: f.id,
    facture: f,
    numero: 1480,
    montant,
    mode: 'ESPECES',
    reference: null,
    datePaiement: new Date('2026-10-01T10:00:00Z'),
    saisieParId: 'caissier',
    ...extra,
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaiementsService(prisma);
    prisma.paiement.aggregate.mockResolvedValue({ _sum: { montant: null } });
  });

  it('exige le bon code et un motif', async () => {
    await expect(service.annuler('ecole', ['p1'], 'erreur', 'u1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.annuler('ecole', ['p1'], 'erreur', 'u1', '0000')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.annuler('ecole', ['p1'], '  ', 'u1', '2026')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.paiement.deleteMany).not.toHaveBeenCalled();
  });

  it('refuse un paiement introuvable (déjà annulé)', async () => {
    prisma.paiement.findMany.mockResolvedValue([]);
    await expect(service.annuler('ecole', ['p1'], 'erreur', 'u1', '2026')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('garde la trace, retire le paiement et recalcule la facture', async () => {
    const t1 = facture('t1', 'Écolage - Tranche 1', 500000, 500000);
    prisma.paiement.findMany.mockResolvedValue([paiement('p1', t1, 300000)]);
    prisma.facture.findMany.mockResolvedValue([t1]);
    prisma.paiement.aggregate.mockResolvedValue({ _sum: { montant: 200000 } });

    const r = await service.annuler('ecole', ['p1'], ' doublon ', 'fondateur', '2026');

    expect(r).toEqual({ annules: 1, montant: 300000 });
    expect(prisma.paiementAnnule.create.mock.calls[0][0].data).toMatchObject({
      paiementId: 'p1',
      eleveId: 'e1',
      factureLibelle: 'Écolage - Tranche 1',
      numero: 1480,
      montant: 300000,
      motif: 'doublon',
      annuleParId: 'fondateur',
    });
    expect(prisma.transactionMobileMoney.updateMany).toHaveBeenCalledWith({ where: { paiementId: { in: ['p1'] } }, data: { paiementId: null } });
    expect(prisma.paiement.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['p1'] }, ecoleId: 'ecole' } });
    expect(prisma.facture.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { montantPaye: 200000, statut: 'PARTIELLE' } });
  });

  it("une facture sans plus aucun versement redevient impayée", async () => {
    const f = facture('i1', "Frais d'inscription", 100000, 100000, { type: 'INSCRIPTION' });
    prisma.paiement.findMany.mockResolvedValue([paiement('p1', f, 100000)]);
    prisma.facture.findMany.mockResolvedValue([]);

    await service.annuler('ecole', ['p1'], 'erreur', 'u1', '2026');

    expect(prisma.facture.update).toHaveBeenCalledWith({ where: { id: 'i1' }, data: { montantPaye: 0, statut: 'IMPAYEE' } });
  });

  it("refuse d'annuler une tranche tant qu'une tranche suivante garde un versement", async () => {
    const t1 = facture('t1', 'Écolage - Tranche 1', 500000, 500000);
    const t2 = facture('t2', 'Écolage - Tranche 2', 500000, 100000);
    prisma.paiement.findMany.mockResolvedValue([paiement('p1', t1, 500000)]);
    prisma.facture.findMany.mockResolvedValue([t1, t2]);

    await expect(service.annuler('ecole', ['p1'], 'erreur', 'u1', '2026')).rejects.toThrow('Tranche 2');
    expect(prisma.paiement.deleteMany).not.toHaveBeenCalled();
  });

  it("accepte d'annuler ensemble les deux tranches d'une même opération", async () => {
    const t1 = facture('t1', 'Écolage - Tranche 1', 500000, 500000);
    const t2 = facture('t2', 'Écolage - Tranche 2', 500000, 100000);
    prisma.paiement.findMany.mockResolvedValue([
      paiement('p1', t1, 500000, { reference: 'lot:x' }),
      paiement('p2', t2, 100000, { reference: 'lot:x', numero: 1481 }),
    ]);
    prisma.facture.findMany.mockResolvedValue([t1, t2]);

    const r = await service.annuler('ecole', ['p1', 'p2'], 'erreur', 'u1', '2026');

    expect(r).toEqual({ annules: 2, montant: 600000 });
    expect(prisma.paiementAnnule.create).toHaveBeenCalledTimes(2);
    expect(prisma.facture.update).toHaveBeenCalledTimes(2);
  });

  it('refuse des paiements de plusieurs élèves', async () => {
    const a = facture('t1', 'Écolage - Tranche 1', 500000, 500000);
    const b = facture('t9', 'Écolage - Tranche 1', 500000, 500000, { eleveId: 'e2' });
    prisma.paiement.findMany.mockResolvedValue([paiement('p1', a, 1), paiement('p2', b, 1)]);
    await expect(service.annuler('ecole', ['p1', 'p2'], 'erreur', 'u1', '2026')).rejects.toBeInstanceOf(BadRequestException);
  });
});
