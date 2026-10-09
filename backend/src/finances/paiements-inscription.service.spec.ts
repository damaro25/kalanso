import { PaiementsService } from './paiements.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe("PaiementsService : payer l'inscription / la réinscription", () => {
  let prisma: any;
  let service: PaiementsService;

  const classe = { id: 'c1', nom: '5eme A', niveauId: 'n5', niveau: { nom: '5eme' } };
  const ANNEE = { id: 'a1', libelle: '2026-2027' };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaiementsService(prisma);

    prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
    prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
    // inscription de l'année courante ; aucune inscription antérieure par défaut
    prisma.inscription.findFirst.mockImplementation(async ({ where }: any) =>
      where.anneeScolaireId === 'a1' ? { id: 'i1', classe } : null,
    );
    prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: 40000 });
    prisma.facture.findFirst.mockResolvedValue(null);
    prisma.facture.create.mockImplementation(async ({ data }: any) => ({ id: 'f-neuve', ...data }));
    // création du paiement (PaiementsService.create)
    prisma.facture.findFirstOrThrow.mockImplementation(async ({ where }: any) => ({ id: where.id, montantTotal: 75000, montantPaye: 0 }));
    // comme la base : l'identifiant est généré quand le service n'en fournit pas
    prisma.paiement.create.mockImplementation(async ({ data }: any) => ({ ...data, id: data.id ?? 'p1' }));
  });

  const sousReinscription = () =>
    prisma.inscription.findFirst.mockImplementation(async ({ where }: any) =>
      where.anneeScolaireId === 'a1' ? { id: 'i1', classe } : { id: 'ancienne' },
    );

  describe('apercuInscription', () => {
    it('nouvel élève sans facture : inscription au tarif nouveaux, à payer', async () => {
      const r = await service.apercuInscription('ecole', 'e1');

      expect(r).toMatchObject({
        type: 'INSCRIPTION',
        libelle: 'Inscription',
        classe: '5eme A',
        niveau: '5eme',
        factureId: null,
        montant: 75000,
        dejaPaye: 0,
        reste: 75000,
        etat: 'A_PAYER',
      });
    });

    it("élève déjà inscrit une année antérieure : réinscription au tarif de réinscription", async () => {
      sousReinscription();

      const r = await service.apercuInscription('ecole', 'e1');

      expect(r).toMatchObject({ type: 'REINSCRIPTION', libelle: 'Réinscription', montant: 40000, reste: 40000, etat: 'A_PAYER' });
      // la détection porte sur une inscription d'une AUTRE année
      expect(prisma.inscription.findFirst.mock.calls[1][0].where).toMatchObject({ eleveId: 'e1', anneeScolaireId: { not: 'a1' } });
    });

    it("le frais est cherché pour le niveau de la classe de l'élève et l'année courante", async () => {
      await service.apercuInscription('ecole', 'e1');
      expect(prisma.fraisInscriptionNiveau.findFirst.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', niveauId: 'n5', anneeScolaireId: 'a1' });
    });

    it("la facture d'inscription déjà générée à l'admission fait foi pour le montant et le reste", async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'f-admission', montantTotal: 75000, montantPaye: 25000 });
      const r = await service.apercuInscription('ecole', 'e1');
      expect(r).toMatchObject({ factureId: 'f-admission', montant: 75000, dejaPaye: 25000, reste: 50000, etat: 'A_PAYER' });
    });

    it('facture soldée : état PAYEE', async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'f-admission', montantTotal: 75000, montantPaye: 75000 });
      expect((await service.apercuInscription('ecole', 'e1')).etat).toBe('PAYEE');
    });

    it('sans frais défini pour le niveau (et sans facture) : FRAIS_NON_DEFINIS', async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
      expect((await service.apercuInscription('ecole', 'e1')).etat).toBe('FRAIS_NON_DEFINIS');
    });

    it("refuse sans année courante, ou pour un élève sans classe cette année", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.apercuInscription('ecole', 'e1')).rejects.toThrow('Aucune année scolaire courante');

      prisma.anneeScolaire.findFirst.mockResolvedValue(ANNEE);
      prisma.inscription.findFirst.mockResolvedValue(null);
      await expect(service.apercuInscription('ecole', 'e1')).rejects.toThrow("n'est inscrit dans aucune classe");
    });

    it("cloisonne l'élève par école", async () => {
      prisma.eleve.findFirstOrThrow.mockRejectedValue(new Error('introuvable'));
      await expect(service.apercuInscription('ecole', 'e-etranger')).rejects.toThrow('introuvable');
      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'e-etranger', ecoleId: 'ecole' });
    });
  });

  describe('payerInscription', () => {
    it("sans facture : crée la facture d'inscription au montant du niveau puis encaisse exactement ce montant", async () => {
      const r = await service.payerInscription('ecole', 'e1', 'u1');

      expect(prisma.facture.create.mock.calls[0][0].data).toEqual({
        ecoleId: 'ecole',
        eleveId: 'e1',
        anneeScolaireId: 'a1',
        libelle: "Frais d'inscription - 5eme A",
        type: 'INSCRIPTION',
        montantTotal: 75000,
      });
      expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({
        factureId: 'f-neuve',
        montant: 75000,
        reference: 'Inscription',
        saisieParId: 'u1',
        ecoleId: 'ecole',
      });
      expect(prisma.facture.update.mock.calls[0][0].data).toEqual({ montantPaye: 75000, statut: 'PAYEE' });
      expect(r).toMatchObject({ factureId: 'f-neuve', type: 'INSCRIPTION', montant: 75000 });
      expect(r.paiement.id).toBe('p1');
    });

    it('réinscription : facture et paiement au tarif de réinscription, libellé dédié', async () => {
      sousReinscription();
      prisma.facture.findFirstOrThrow.mockImplementation(async ({ where }: any) => ({ id: where.id, montantTotal: 40000, montantPaye: 0 }));

      const r = await service.payerInscription('ecole', 'e1', 'u1');

      expect(prisma.facture.create.mock.calls[0][0].data).toMatchObject({ libelle: 'Frais de réinscription - 5eme A', montantTotal: 40000 });
      expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({ montant: 40000, reference: 'Réinscription' });
      expect(r.type).toBe('REINSCRIPTION');
    });

    it("avec la facture générée à l'admission : ne la recrée pas et encaisse son reste", async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'f-admission', montantTotal: 75000, montantPaye: 25000 });
      prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f-admission', montantTotal: 75000, montantPaye: 25000 });

      const r = await service.payerInscription('ecole', 'e1', 'u1');

      expect(prisma.facture.create).not.toHaveBeenCalled();
      expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({ factureId: 'f-admission', montant: 50000 });
      expect(prisma.facture.update.mock.calls[0][0].data).toEqual({ montantPaye: 75000, statut: 'PAYEE' });
      expect(r.montant).toBe(50000);
    });

    it('transmet le mode de paiement choisi, espèces par défaut', async () => {
      await service.payerInscription('ecole', 'e1', 'u1', 'VIREMENT');
      expect(prisma.paiement.create.mock.calls[0][0].data.mode).toBe('VIREMENT');

      prisma.paiement.create.mockClear();
      await service.payerInscription('ecole', 'e1', 'u1');
      expect(prisma.paiement.create.mock.calls[0][0].data.mode).toBeUndefined(); // défaut du schéma : ESPECES
    });

    describe("choix du type d'opération par le caissier", () => {
      it("nouvel élève détecté « inscription » mais qui revient : en choisissant « réinscription », facture et paiement au tarif de réinscription", async () => {
        prisma.facture.findFirstOrThrow.mockImplementation(async ({ where }: any) => ({ id: where.id, montantTotal: 40000, montantPaye: 0 }));

        const r = await service.payerInscription('ecole', 'e1', 'u1', undefined, 'REINSCRIPTION');

        expect(prisma.facture.create.mock.calls[0][0].data).toMatchObject({ libelle: 'Frais de réinscription - 5eme A', montantTotal: 40000 });
        expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({ montant: 40000, reference: 'Réinscription' });
        expect(r).toMatchObject({ type: 'REINSCRIPTION', montant: 40000 });
      });

      it("facture générée à l'admission comme « inscription », encore sans versement : changer pour « réinscription » la met à jour avant d'encaisser", async () => {
        prisma.facture.findFirst.mockResolvedValue({ id: 'f-adm', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 0 });
        prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f-adm', montantTotal: 40000, montantPaye: 0 });

        const r = await service.payerInscription('ecole', 'e1', 'u1', 'ESPECES', 'REINSCRIPTION');

        expect(prisma.facture.create).not.toHaveBeenCalled();
        const maj = prisma.facture.update.mock.calls[0][0];
        expect(maj.where).toEqual({ id: 'f-adm' });
        expect(maj.data).toEqual({ libelle: 'Frais de réinscription - 5eme A', montantTotal: 40000 });
        // le paiement porte sur le nouveau montant, puis solde la facture
        expect(prisma.paiement.create.mock.calls[0][0].data).toMatchObject({ factureId: 'f-adm', montant: 40000 });
        expect(r).toMatchObject({ type: 'REINSCRIPTION', montant: 40000 });
      });

      it("choisir le même type que la facture ne la modifie pas", async () => {
        prisma.facture.findFirst.mockResolvedValue({ id: 'f-adm', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 0 });
        prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f-adm', montantTotal: 75000, montantPaye: 0 });

        await service.payerInscription('ecole', 'e1', 'u1', undefined, 'INSCRIPTION');

        // seule la mise à jour du montant payé par le paiement lui-même, pas de changement de libellé
        for (const [arg] of prisma.facture.update.mock.calls) expect(arg.data).not.toHaveProperty('libelle');
      });

      it("refuse de changer le type quand un versement a déjà été enregistré sur la facture", async () => {
        prisma.facture.findFirst.mockResolvedValue({ id: 'f-adm', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 25000 });

        await expect(service.payerInscription('ecole', 'e1', 'u1', undefined, 'REINSCRIPTION')).rejects.toThrow('ne peut plus être changé');
        expect(prisma.facture.update).not.toHaveBeenCalled();
        expect(prisma.paiement.create).not.toHaveBeenCalled();
      });

      it("avec un versement déjà fait, le même type que la facture reste accepté (paiement du reste)", async () => {
        prisma.facture.findFirst.mockResolvedValue({ id: 'f-adm', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 25000 });
        prisma.facture.findFirstOrThrow.mockResolvedValue({ id: 'f-adm', montantTotal: 75000, montantPaye: 25000 });

        const r = await service.payerInscription('ecole', 'e1', 'u1', undefined, 'INSCRIPTION');
        expect(r.montant).toBe(50000);
      });

      it("réinscription choisie sans tarif de réinscription défini : retombe sur le tarif nouveaux", async () => {
        prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: null });
        prisma.facture.findFirstOrThrow.mockImplementation(async ({ where }: any) => ({ id: where.id, montantTotal: 75000, montantPaye: 0 }));

        const r = await service.payerInscription('ecole', 'e1', 'u1', undefined, 'REINSCRIPTION');
        expect(r.montant).toBe(75000);
      });

      it("un élève déjà soldé ne peut plus rien payer, quel que soit le type demandé", async () => {
        prisma.facture.findFirst.mockResolvedValue({ id: 'f-adm', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 75000 });
        await expect(service.payerInscription('ecole', 'e1', 'u1', undefined, 'INSCRIPTION')).rejects.toThrow('déjà payés');
        await expect(service.payerInscription('ecole', 'e1', 'u1', undefined, 'REINSCRIPTION')).rejects.toThrow(/déjà payés|ne peut plus/);
      });
    });

    it("l'aperçu donne le frais de chaque type et indique si le type est modifiable", async () => {
      const r = await service.apercuInscription('ecole', 'e1');
      expect(r.montants).toEqual({ INSCRIPTION: 75000, REINSCRIPTION: 40000 });
      expect(r.typeModifiable).toBe(true);

      prisma.facture.findFirst.mockResolvedValue({ id: 'f', libelle: "Frais d'inscription - 5eme A", montantTotal: 75000, montantPaye: 25000 });
      expect((await service.apercuInscription('ecole', 'e1')).typeModifiable).toBe(false);
    });

    it('refuse de payer deux fois : facture déjà soldée, aucune écriture', async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'f-admission', montantTotal: 75000, montantPaye: 75000 });

      await expect(service.payerInscription('ecole', 'e1', 'u1')).rejects.toThrow('déjà payés');
      expect(prisma.paiement.create).not.toHaveBeenCalled();
      expect(prisma.facture.create).not.toHaveBeenCalled();
    });

    it("refuse quand aucun frais d'inscription n'est défini pour le niveau, en citant le niveau et la page Tarifs", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);

      await expect(service.payerInscription('ecole', 'e1', 'u1')).rejects.toThrow(/niveau 5eme.*page Tarifs/);
      expect(prisma.facture.create).not.toHaveBeenCalled();
      expect(prisma.paiement.create).not.toHaveBeenCalled();
    });

    it("ignore une facture d'inscription annulée pour retrouver la facture à payer", async () => {
      await service.payerInscription('ecole', 'e1', 'u1');
      expect(prisma.facture.findFirst.mock.calls[0][0].where).toMatchObject({
        eleveId: 'e1',
        anneeScolaireId: 'a1',
        type: 'INSCRIPTION',
        statut: { not: 'ANNULEE' },
      });
    });
  });
});
