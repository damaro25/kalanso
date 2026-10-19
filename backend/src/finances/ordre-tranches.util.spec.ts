import { estAnterieure, exigerTranchesPrecedentesSoldees } from './ordre-tranches.util';

const tranche = (n: number, echeance: string | null, id = `t${n}`) => ({
  id,
  libelle: `Internat - Tranche ${n}`,
  dateEcheance: echeance ? new Date(echeance) : null,
});

describe('Ordre de paiement des tranches', () => {
  it("compare par échéance, puis par numéro de tranche", () => {
    expect(estAnterieure(tranche(1, '2026-10-31'), tranche(2, '2027-01-31'))).toBe(true);
    expect(estAnterieure(tranche(2, '2027-01-31'), tranche(1, '2026-10-31'))).toBe(false);
    expect(estAnterieure(tranche(1, null), tranche(2, null))).toBe(true);
    expect(estAnterieure(tranche(3, '2026-10-31'), tranche(1, null))).toBe(true); // une échéance passe avant « aucune »
  });

  const facture = (n: number, echeance: string | null, type = 'ECOLAGE') => ({
    ...tranche(n, echeance),
    type,
    ecoleId: 'ecole',
    eleveId: 'e1',
    anneeScolaireId: 'a1',
  });

  it('refuse un versement sur la tranche 2 tant que la tranche 1 reste due', async () => {
    const prisma = { facture: { findMany: jest.fn().mockResolvedValue([tranche(1, '2026-10-31'), tranche(3, '2027-04-30')]) } };
    await expect(exigerTranchesPrecedentesSoldees(prisma, facture(2, '2027-01-31'))).rejects.toThrow(
      'Soldez d\'abord « Internat - Tranche 1 »',
    );
    expect(prisma.facture.findMany.mock.calls[0][0].where).toMatchObject({
      eleveId: 'e1',
      anneeScolaireId: 'a1',
      type: 'ECOLAGE',
      statut: { in: ['IMPAYEE', 'PARTIELLE'] },
      id: { not: 't2' },
    });
  });

  it('accepte la première tranche due, et ne contrôle pas les autres factures', async () => {
    const prisma = { facture: { findMany: jest.fn().mockResolvedValue([tranche(2, '2027-01-31')]) } };
    await expect(exigerTranchesPrecedentesSoldees(prisma, facture(1, '2026-10-31'))).resolves.toBeUndefined();
    await expect(exigerTranchesPrecedentesSoldees(prisma, facture(1, null, 'ASSURANCE'))).resolves.toBeUndefined();
    expect(prisma.facture.findMany).toHaveBeenCalledTimes(1);
  });
});
