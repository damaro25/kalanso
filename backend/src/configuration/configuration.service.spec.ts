import { BadRequestException } from '@nestjs/common';
import { ConfigurationService } from './configuration.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { libelleTranche, lireTranche } from './grille';
import { tarifsMameTa } from './modele-mame-ta';

describe('grille : libellés des tranches', () => {
  it('relit régime et numéro du libellé produit', () => {
    expect(libelleTranche('SEMI_INTERNAT', 2)).toBe('Semi-internat - Tranche 2');
    expect(lireTranche({ libelle: 'Semi-internat - Tranche 2', regime: 'SEMI_INTERNAT' })).toEqual({
      regime: 'SEMI_INTERNAT',
      numero: 2,
    });
    expect(lireTranche({ libelle: 'Écolage - Tranche 1', regime: null })).toEqual({ regime: 'TOUS', numero: 1 });
  });

  it('ignore les tarifs saisis à la main ou dont le régime ne correspond pas au libellé', () => {
    expect(lireTranche({ libelle: 'Ecolage annuel', regime: null })).toBeNull();
    expect(lireTranche({ libelle: 'Internat - Tranche 1', regime: 'EXTERNAT' })).toBeNull();
    expect(lireTranche({ libelle: 'Internat - Tranche 4', regime: 'INTERNAT' })).toBeNull();
  });
});

describe('modèle Mamé-TA', () => {
  const total = (t: (number | null)[] | undefined) => (t ?? []).reduce<number>((a, m) => a + (m ?? 0), 0);

  it('reprend les totaux de la fiche 2025-2026', () => {
    const tarifs = tarifsMameTa();
    expect(total(tarifs.get('Crèche / Garderie')?.TOUS)).toBe(3_500_000);
    expect(total(tarifs.get('MS')?.EXTERNAT)).toBe(1_100_000);
    expect(total(tarifs.get('MS')?.SEMI_INTERNAT)).toBe(4_000_000);
    expect(total(tarifs.get('MS')?.INTERNAT)).toBe(5_000_000);
    expect(total(tarifs.get('2ème année')?.EXTERNAT)).toBe(1_200_000);
    expect(total(tarifs.get('4ème année')?.EXTERNAT)).toBe(1_300_000);
    expect(total(tarifs.get('6ème année')?.EXTERNAT)).toBe(1_500_000);
    expect(total(tarifs.get('1ère année')?.SEMI_INTERNAT)).toBe(5_000_000);
    expect(total(tarifs.get('1ère année')?.INTERNAT)).toBe(6_500_000);
    expect(total(tarifs.get('GS')?.PENSIONNAT)).toBe(9_750_000);
    expect(tarifs.get('Crèche / Garderie')?.PENSIONNAT).toBeUndefined();
  });
});

describe('ConfigurationService', () => {
  let prisma: any;
  let service: ConfigurationService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ConfigurationService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
    prisma.niveau.findMany.mockResolvedValue([{ id: 'n1', nom: 'PS', cycle: 'Maternelle' }]);
    prisma.tarifEcolage.findMany.mockResolvedValue([]);
    prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([]);
  });

  describe('grille', () => {
    it('range les tranches par niveau et régime et en déduit les échéances', async () => {
      prisma.tarifEcolage.findMany.mockResolvedValue([
        { niveauId: 'n1', libelle: 'Internat - Tranche 1', regime: 'INTERNAT', montant: 2500000, dateEcheance: null },
        {
          niveauId: 'n1',
          libelle: 'Internat - Tranche 2',
          regime: 'INTERNAT',
          montant: 2000000,
          dateEcheance: new Date('2026-01-06'),
        },
        { niveauId: 'n1', libelle: 'Ecolage annuel', regime: null, montant: 999, dateEcheance: null },
      ]);
      prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([
        { niveauId: 'n1', montant: 100000, montantReinscription: 50000 },
      ]);

      const g = await service.grille('ecole', 'a1');

      expect(g.echeances).toEqual([null, '2026-01-06', null]);
      expect(g.niveaux[0]).toMatchObject({
        niveauId: 'n1',
        fraisInscription: 100000,
        fraisReinscription: 50000,
        tarifs: { INTERNAT: [2500000, 2000000, null] },
      });
    });

    it("refuse une année d'une autre école", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.grille('ecole', 'autre')).rejects.toThrow(BadRequestException);
    });
  });

  describe('enregistrerGrille', () => {
    const grille = (tarifs: any, echeances: (string | null)[] = [null, '2026-01-06', '2026-04-10']) => ({
      echeances,
      niveaux: [{ niveauId: 'n1', fraisInscription: 100000, fraisReinscription: 50000, tarifs }],
    });

    it('crée les tranches renseignées avec régime et échéance, met à jour et supprime les existantes', async () => {
      prisma.tarifEcolage.findMany.mockResolvedValueOnce([
        { id: 't-ext1', niveauId: 'n1', libelle: 'Externat - Tranche 1' },
        { id: 't-int3', niveauId: 'n1', libelle: 'Internat - Tranche 3' },
      ]);

      await service.enregistrerGrille('ecole', 'a1', grille({ EXTERNAT: [500000, 400000, 0] }) as any);

      expect(prisma.tarifEcolage.update).toHaveBeenCalledWith({
        where: { id: 't-ext1' },
        data: { montant: 500000, regime: 'EXTERNAT', dateEcheance: null },
      });
      expect(prisma.tarifEcolage.create).toHaveBeenCalledTimes(1);
      expect(prisma.tarifEcolage.create.mock.calls[0][0].data).toEqual({
        ecoleId: 'ecole',
        niveauId: 'n1',
        anneeScolaireId: 'a1',
        libelle: 'Externat - Tranche 2',
        montant: 400000,
        regime: 'EXTERNAT',
        dateEcheance: new Date('2026-01-06'),
      });
      // tranche vidée (Internat 3) : supprimée ; Externat 3 à 0 et inexistante : rien
      expect(prisma.tarifEcolage.delete).toHaveBeenCalledTimes(1);
      expect(prisma.tarifEcolage.delete).toHaveBeenCalledWith({ where: { id: 't-int3' } });
      expect(prisma.fraisInscriptionNiveau.upsert.mock.calls[0][0].update).toEqual({
        montant: 100000,
        montantReinscription: 50000,
      });
    });

    it("« tous régimes » crée un tarif sans régime ; sans frais d'inscription, le montant du niveau est retiré", async () => {
      await service.enregistrerGrille('ecole', 'a1', {
        echeances: [null, null, null],
        niveaux: [{ niveauId: 'n1', fraisInscription: null, fraisReinscription: null, tarifs: { TOUS: [1, null, null] } }],
      } as any);
      expect(prisma.tarifEcolage.create.mock.calls[0][0].data).toMatchObject({ libelle: 'Écolage - Tranche 1', regime: null });
      expect(prisma.fraisInscriptionNiveau.deleteMany).toHaveBeenCalled();
      expect(prisma.fraisInscriptionNiveau.upsert).not.toHaveBeenCalled();
    });

    it.each([
      ['un régime inconnu', grille({ DEMI_PENSION: [1, 2, 3] })],
      ['un montant négatif', grille({ EXTERNAT: [-1, 0, 0] })],
      ['un nombre de tranches incorrect', grille({ EXTERNAT: [1, 2] })],
      ['une échéance invalide', grille({}, [null, '06/01/2026', null])],
    ])('refuse %s sans rien écrire', async (_cas, dto) => {
      await expect(service.enregistrerGrille('ecole', 'a1', dto as any)).rejects.toThrow(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("refuse un niveau d'une autre école", async () => {
      const dto = grille({});
      dto.niveaux[0].niveauId = 'n-autre';
      await expect(service.enregistrerGrille('ecole', 'a1', dto as any)).rejects.toThrow('Niveau invalide');
    });
  });
});
