import { PaiementsService } from './paiements.service';
import { genererRecuPdf } from './recu.util';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

const ECOLE = { telephone: null, email: null, carteRetraitMinistere: null, carteRetraitDev: null, carteRetraitDce: null };
const ELEVE = { nom: 'BAH', prenom: 'Aissatou', matricule: '253585' };

const paiement = (id: string, numero: number, montant: number, facture: { type: string; libelle: string }, reference: string | null) => ({
  id,
  numero,
  montant,
  mode: 'ESPECES',
  reference,
  datePaiement: new Date('2026-10-19T10:00:00Z'),
  facture: { ...facture, eleveId: 'e1', anneeScolaireId: 'a1', eleve: ELEVE, ecole: ECOLE },
});

describe('PaiementsService : reçu', () => {
  let prisma: any;
  let service: PaiementsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaiementsService(prisma);
    prisma.inscription.findFirst.mockResolvedValue({ regime: 'EXTERNAT', classe: { niveau: { nom: 'CP', cycle: 'Primaire' } } });
    const d = (iso: string) => new Date(iso);
    prisma.facture.findMany.mockResolvedValue([
      // tranche 1 : 800 000 versés jusqu'au reçu (10:00:00), puis 100 000 le lendemain (ne comptent pas)
      {
        type: 'ECOLAGE',
        libelle: 'Externat - Tranche 1',
        montantTotal: 1000000,
        dateEcheance: null,
        createdAt: d('2026-10-01T00:00:00Z'),
        paiements: [
          { montant: 600000, datePaiement: d('2026-10-10T09:00:00Z') },
          { montant: 200000, datePaiement: d('2026-10-19T10:00:00.400Z') },
          { montant: 100000, datePaiement: d('2026-10-20T08:00:00Z') },
        ],
      },
      { type: 'ECOLAGE', libelle: 'Externat - Tranche 2', montantTotal: 400000, dateEcheance: null, createdAt: d('2026-10-01T00:00:00Z'), paiements: [] },
      // facture créée après le reçu : absente du reste à payer
      { type: 'AUTRE', libelle: 'Cantine', montantTotal: 30000, dateEcheance: null, createdAt: d('2026-10-21T00:00:00Z'), paiements: [] },
    ]);
  });

  it('paiements enregistrés ensemble : un seul reçu, au total, « insc + T-sh + T1 », au numéro du premier', async () => {
    const lot = [
      paiement('p1', 17, 100000, { type: 'INSCRIPTION', libelle: "Frais d'inscription - CP" }, 'lot:x'),
      paiement('p2', 18, 50000, { type: 'ASSURANCE', libelle: 'T-shirt 2026-2027' }, 'lot:x'),
      paiement('p3', 19, 200000, { type: 'ECOLAGE', libelle: 'Externat - Tranche 1' }, 'lot:x'),
    ];
    prisma.paiement.findFirstOrThrow.mockResolvedValue(lot[2]);
    prisma.paiement.findMany.mockResolvedValue(lot);

    const r = await service.donneesRecu('ecole', 'p3');

    expect(prisma.paiement.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', reference: 'lot:x' });
    expect(r).toMatchObject({ numero: '000017', montant: 350000, factureLibelle: 'insc + T-sh + T1', resteDetail: '200.000T1 + T2', resteAPayer: 600000 });
    // le PDF se génère au format du carnet
    expect((await genererRecuPdf(r)).length).toBeGreaterThan(1000);
  });

  it('paiement seul : reçu habituel, sans recherche de lot', async () => {
    prisma.paiement.findFirstOrThrow.mockResolvedValue(paiement('p9', 20, 50000, { type: 'ASSURANCE', libelle: 'T-shirt 2026-2027' }, null));
    const r = await service.donneesRecu('ecole', 'p9');
    expect(prisma.paiement.findMany).not.toHaveBeenCalled();
    expect(r).toMatchObject({ numero: '000020', montant: 50000, factureLibelle: 'T-shirt 2026-2027' });
  });
});
