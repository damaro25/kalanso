import { BadRequestException } from '@nestjs/common';
import { ReportingService } from './reporting.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('ReportingService.dashboard', () => {
  let prisma: any;
  let service: ReportingService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ReportingService(prisma);

    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    prisma.inscription.count.mockResolvedValue(42);
    prisma.personnel.count.mockResolvedValue(7);
    prisma.facture.findMany.mockImplementation(async ({ where }: any) =>
      where.type === 'INSCRIPTION'
        ? [{ montantPaye: 60000 }, { montantPaye: 55000 }]
        : [
            { montantTotal: 1000000, montantPaye: 400000 },
            { montantTotal: 500000, montantPaye: 0 },
          ],
    );
    prisma.absence.findMany.mockResolvedValue([
      { statut: 'ABSENT' },
      { statut: 'ABSENT' },
      { statut: 'RETARD' },
      { statut: 'PRESENT' },
      { statut: 'PRESENT' },
      { statut: 'PRESENT' },
    ]);
  });

  it("scope tout sur l'année scolaire courante et annonce laquelle", async () => {
    const r = await service.dashboard('ecole');

    expect(r.anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
    expect(prisma.inscription.count.mock.calls[0][0].where).toEqual({
      ecoleId: 'ecole',
      anneeScolaireId: 'a1',
      statut: 'EN_COURS',
    });
    for (const call of prisma.facture.findMany.mock.calls) {
      expect(call[0].where.anneeScolaireId).toBe('a1');
    }
  });

  it('compte les élèves inscrits cette année (pas tous les élèves actifs) et le personnel actif', async () => {
    const r = await service.dashboard('ecole');
    expect(r.totalEleves).toBe(42);
    expect(r.totalPersonnel).toBe(7);
    expect(prisma.eleve.count).not.toHaveBeenCalled();
    expect(prisma.personnel.count.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', actif: true });
  });

  it("frais d'inscription : somme encaissée des factures INSCRIPTION non annulées", async () => {
    const r = await service.dashboard('ecole');
    expect(r.fraisInscription).toEqual({ encaisse: 115000 });
    const inscriptionWhere = prisma.facture.findMany.mock.calls
      .map((c: any) => c[0].where)
      .find((w: any) => w.type === 'INSCRIPTION');
    expect(inscriptionWhere.statut).toEqual({ not: 'ANNULEE' });
  });

  it('impayés : reste à payer des factures IMPAYEE/PARTIELLE', async () => {
    const r = await service.dashboard('ecole');
    expect(r.impayes).toEqual({ nombre: 2, montant: 1100000 });
    const impayesWhere = prisma.facture.findMany.mock.calls
      .map((c: any) => c[0].where)
      .find((w: any) => w.statut?.in);
    expect(impayesWhere.statut.in).toEqual(['IMPAYEE', 'PARTIELLE']);
  });

  it("absences du jour : ventilation absents / retards / présents", async () => {
    const r = await service.dashboard('ecole');
    expect(r.absencesAujourdhui).toEqual({ absents: 2, retards: 1, presents: 3 });
  });

  it("à défaut d'année courante, utilise la plus récente", async () => {
    prisma.anneeScolaire.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'a-recente', libelle: '2027-2028' });
    const r = await service.dashboard('ecole');
    expect(r.anneeScolaire.id).toBe('a-recente');
  });

  it("échoue avec un message clair quand l'école n'a aucune année scolaire", async () => {
    prisma.anneeScolaire.findFirst.mockResolvedValue(null);
    await expect(service.dashboard('ecole')).rejects.toThrow(BadRequestException);
  });
});
