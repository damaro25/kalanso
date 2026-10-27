import { BadRequestException } from '@nestjs/common';
import { FORMATIONS_HABITUELLES, FormationsService, libelleMois } from './formations.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('FormationsService (formations supplémentaires)', () => {
  let prisma: any;
  let service: FormationsService;
  const ANNEE = { id: 'a1', libelle: '2026-2027', courante: true };
  const ARABE = { id: 'f-ar', nom: 'Arabe', tarifMensuel: 25000, regimesGratuits: ['INTERNAT', 'SEMI_INTERNAT'], actif: true };
  const ANGLAIS = { id: 'f-an', nom: 'Anglais', tarifMensuel: 0, regimesGratuits: [], actif: true };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FormationsService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
    prisma.facture.findMany.mockResolvedValue([]);
    prisma.inscription.findMany.mockResolvedValue([]);
    prisma.facture.create.mockImplementation(async ({ data }: any) => data);
    prisma.formationSupplementaire.findMany.mockResolvedValue([]);
  });

  describe('catalogue', () => {
    it('crée une formation, nom nettoyé, tarif 0 et aucune gratuité par défaut', async () => {
      prisma.formationSupplementaire.create.mockImplementation(async ({ data }: any) => data);
      const f = await service.creer('ecole', { nom: '  Anglais ' });
      expect(f).toEqual({ ecoleId: 'ecole', nom: 'Anglais', tarifMensuel: 0, regimesGratuits: [], actif: true });
    });

    it('refuse un nom vide, un nom déjà pris ou un tarif négatif', async () => {
      await expect(service.creer('ecole', { nom: ' ' })).rejects.toThrow(BadRequestException);
      await expect(service.creer('ecole', { nom: 'Arabe', tarifMensuel: -5 })).rejects.toThrow(BadRequestException);
      prisma.formationSupplementaire.findMany.mockResolvedValue([{ nom: 'Arabe' }]); // comparaison sans la casse
      await expect(service.creer('ecole', { nom: 'arabe' })).rejects.toThrow('existe déjà');
      expect(prisma.formationSupplementaire.create).not.toHaveBeenCalled();
    });

    it("n'ajoute que les formations habituelles manquantes, avec leurs tarifs et gratuités", async () => {
      prisma.formationSupplementaire.findMany.mockResolvedValue([{ nom: 'arabe' }]);
      const r = await service.ajouterHabituelles('ecole');
      expect(r.ajoutees).toEqual(['Informatique', 'Anglais']);
      const data = prisma.formationSupplementaire.createMany.mock.calls[0][0].data;
      expect(data[0]).toEqual({ ecoleId: 'ecole', nom: 'Informatique', tarifMensuel: 50000, regimesGratuits: ['INTERNAT', 'SEMI_INTERNAT'] });
      expect(FORMATIONS_HABITUELLES.find((f) => f.nom === 'Arabe')?.tarifMensuel).toBe(25000);
    });

    it('ne supprime pas une formation qui a des inscrits ou des factures', async () => {
      prisma.formationSupplementaire.findFirst.mockResolvedValue(ARABE);
      prisma.inscriptionFormation.count.mockResolvedValue(2);
      prisma.facture.count.mockResolvedValue(0);
      await expect(service.supprimer('ecole', 'f-ar')).rejects.toThrow('désactivez-la');
      expect(prisma.formationSupplementaire.delete).not.toHaveBeenCalled();
    });
  });

  describe("formations d'un élève", () => {
    it('indique la gratuité selon le régime de son inscription', async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.inscription.findFirst.mockResolvedValue({ regime: 'INTERNAT' });
      prisma.inscriptionFormation.findMany.mockResolvedValue([
        { id: 'i1', formationId: 'f-ar', formation: ARABE, dateDebut: new Date() },
        { id: 'i2', formationId: 'f-in', formation: { ...ARABE, id: 'f-in', nom: 'Piano', regimesGratuits: [] }, dateDebut: new Date() },
      ]);
      const r = await service.formationsEleve('ecole', 'e1');
      expect(r.regime).toBe('INTERNAT');
      expect(r.formations.map((f) => [f.nom, f.gratuit, f.montantMensuel])).toEqual([
        ['Arabe', true, 0],
        ['Piano', false, 25000],
      ]);
    });

    describe("inscription : le mois en cours est facturé tout de suite (sinon rien n'arrivait au bordereau)", () => {
      beforeEach(() => {
        jest.useFakeTimers().setSystemTime(new Date('2026-10-13T10:00:00Z'));
        prisma.eleve.findFirst.mockResolvedValue({ id: 'e1' });
        prisma.formationSupplementaire.findFirst.mockResolvedValue(ARABE);
        prisma.inscriptionFormation.findMany.mockImplementation(async ({ where }: any) =>
          where.dateDebut ? [{ eleveId: 'e1', formationId: 'f-ar', formation: ARABE }] : [{ id: 'i1', formationId: 'f-ar', formation: ARABE, dateDebut: new Date() }],
        );
      });
      afterEach(() => jest.useRealTimers());

      it('externe : facture FORMATION du mois au prix du catalogue, puis visible sur la fiche', async () => {
        prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1', regime: 'EXTERNAT', anneeScolaireId: 'a1' }]);
        prisma.inscription.findFirst.mockResolvedValue({ regime: 'EXTERNAT' });
        const r = await service.inscrire('ecole', 'e1', 'f-ar');
        expect(prisma.facture.create.mock.calls.map((c: any) => c[0].data)).toEqual([
          expect.objectContaining({
            eleveId: 'e1',
            type: 'FORMATION',
            formationId: 'f-ar',
            moisFormation: '2026-10',
            libelle: 'Formation Arabe — Octobre 2026',
            montantTotal: 25000, // tarif mensuel du catalogue
          }),
        ]);
        expect(r.facturation).toMatchObject({ mois: '2026-10', creees: 1 });
        expect(r.mois).toEqual({ code: '2026-10', libelle: 'Octobre 2026' });
      });

      it('interne (formation gratuite pour son régime) : aucune facture', async () => {
        prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1', regime: 'INTERNAT', anneeScolaireId: 'a1' }]);
        prisma.inscription.findFirst.mockResolvedValue({ regime: 'INTERNAT' });
        const r = await service.inscrire('ecole', 'e1', 'f-ar');
        expect(prisma.facture.create).not.toHaveBeenCalled();
        expect(r.facturation).toMatchObject({ creees: 0, gratuites: 1 });
        expect(r.formations[0]).toMatchObject({ gratuit: true, montantMensuel: 0 });
      });

      it('la fiche montre la facture du mois et ce qui est payé', async () => {
        prisma.inscription.findFirst.mockResolvedValue({ regime: 'EXTERNAT' });
        prisma.facture.findMany.mockResolvedValue([{ id: 'fac1', formationId: 'f-ar', montantTotal: 25000, montantPaye: 10000 }]);
        const r = await service.formationsEleve('ecole', 'e1');
        expect(r.formations[0].factureMois).toEqual({ id: 'fac1', montant: 25000, paye: 10000 });
        expect(prisma.facture.findMany.mock.calls[0][0].where).toMatchObject({ eleveId: 'e1', type: 'FORMATION', moisFormation: '2026-10' });
      });
    });

    it("refuse d'inscrire à une formation désactivée", async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.formationSupplementaire.findFirst.mockResolvedValue({ ...ARABE, actif: false });
      await expect(service.inscrire('ecole', 'e1', 'f-ar')).rejects.toThrow('désactivée');
    });
  });

  describe('facturerMois', () => {
    const inscription = (eleveId: string, formation: any) => ({ eleveId, formationId: formation.id, formation });

    it('facture le mois une fois par élève et formation, sans doublon, rien pour les gratuits ni les tarifs nuls', async () => {
      prisma.inscriptionFormation.findMany.mockResolvedValue([
        inscription('e1', ARABE), // externe : payant
        inscription('e2', ARABE), // interne : gratuit
        inscription('e3', ARABE), // déjà facturé ce mois
        inscription('e1', ANGLAIS), // tarif 0
      ]);
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', regime: 'EXTERNAT', anneeScolaireId: 'a1' },
        { eleveId: 'e2', regime: 'INTERNAT', anneeScolaireId: 'a1' },
        { eleveId: 'e3', regime: 'EXTERNAT', anneeScolaireId: 'a1' },
      ]);
      prisma.facture.findMany.mockResolvedValue([{ eleveId: 'e3', formationId: 'f-ar' }]);

      const r = await service.facturerMois('ecole', '2026-10');

      expect(r).toEqual({ mois: '2026-10', creees: 1, dejaFacturees: 1, gratuites: 2 });
      const data = prisma.facture.create.mock.calls.map((c: any) => c[0].data);
      expect(data).toEqual([
        expect.objectContaining({
          eleveId: 'e1',
          type: 'FORMATION',
          libelle: 'Formation Arabe — Octobre 2026',
          montantTotal: 25000,
          formationId: 'f-ar',
          moisFormation: '2026-10',
          anneeScolaireId: 'a1',
        }),
      ]);
    });

    it('une facture créée entre-temps (doublon sur l’index unique) compte comme déjà facturée', async () => {
      prisma.inscriptionFormation.findMany.mockResolvedValue([inscription('e1', ARABE)]);
      prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1', regime: 'EXTERNAT', anneeScolaireId: 'a1' }]);
      prisma.facture.create.mockRejectedValueOnce(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
      const r = await service.facturerMois('ecole', '2026-10');
      expect(r).toEqual({ mois: '2026-10', creees: 0, dejaFacturees: 1, gratuites: 0 });
    });

    it("ne prend que les inscriptions actives pendant le mois, et peut se limiter à un élève", async () => {
      prisma.inscriptionFormation.findMany.mockResolvedValue([]);
      await service.facturerMois('ecole', '2026-11', 'e1');
      const where = prisma.inscriptionFormation.findMany.mock.calls[0][0].where;
      expect(where).toMatchObject({
        ecoleId: 'ecole',
        anneeScolaireId: 'a1',
        eleveId: 'e1',
        dateDebut: { lt: new Date('2026-12-01T00:00:00Z') },
        OR: [{ dateFin: null }, { dateFin: { gte: new Date('2026-11-01T00:00:00Z') } }],
        formation: { actif: true },
      });
      expect(prisma.facture.create).not.toHaveBeenCalled();
    });

    it('refuse un mois mal formé', async () => {
      await expect(service.facturerMois('ecole', '2026-13')).rejects.toThrow('Mois invalide');
      await expect(service.facturerMois('ecole', '10/2026')).rejects.toThrow('Mois invalide');
    });

    it('libellé du mois en français', () => {
      expect(libelleMois('2027-01')).toBe('Janvier 2027');
    });
  });
});
