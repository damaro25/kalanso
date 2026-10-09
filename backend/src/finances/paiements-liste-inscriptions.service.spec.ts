import { PaiementsService } from './paiements.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('PaiementsService.inscriptionsAPayer (liste de travail du caissier)', () => {
  let prisma: any;
  let service: PaiementsService;

  const CLASSES = [
    { id: 'c1', nom: 'CP1', niveauId: 'n1', niveau: { nom: 'CP1', ordre: 1 } },
    { id: 'c6', nom: '6eme A', niveauId: 'n6', niveau: { nom: '6eme', ordre: 6 } },
  ];
  const inscrit = (id: string, prenom: string, nom: string, matricule: string | null, classe: (typeof CLASSES)[number]) => ({
    eleve: { id, prenom, nom, matricule },
    classe: { id: classe.id, nom: classe.nom, niveauId: classe.niveauId, niveau: classe.niveau },
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new PaiementsService(prisma);

    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    prisma.classe.findMany.mockResolvedValue(CLASSES);
    prisma.inscription.findMany.mockImplementation(async ({ where }: any) =>
      where.anneeScolaireId === 'a1'
        ? [
            inscrit('e1', 'Djiné', 'KANTE', '383CR021', CLASSES[1]), // réinscription, facture à 40 000 impayée
            inscrit('e2', 'Fatoumata', 'BANGOURA', '501CE022', CLASSES[0]), // facture soldée
            inscrit('e3', 'Aliou', 'CONDE', null, CLASSES[0]), // pas de facture : tarif du niveau
            inscrit('e4', 'Sory', 'BAH', '777', CLASSES[1]), // pas de facture, pas de tarif défini
          ]
        : [{ eleveId: 'e1' }], // inscription d'une autre année : e1 est en réinscription
    );
    prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([{ niveauId: 'n1', montant: 55000, montantReinscription: null }]);
    prisma.facture.findMany.mockResolvedValue([
      { id: 'f1', eleveId: 'e1', libelle: 'Frais de réinscription - 6eme A', montantTotal: 40000, montantPaye: 0 },
      { id: 'f2', eleveId: 'e2', libelle: "Frais d'inscription - CP1", montantTotal: 75000, montantPaye: 75000 },
    ]);
  });

  it("par défaut, ne liste que les inscriptions à payer, classées par niveau puis par classe", async () => {
    const r = await service.inscriptionsAPayer('ecole');

    expect(r.anneeScolaire).toEqual({ id: 'a1', libelle: '2026-2027' });
    expect(r.lignes.map((l) => [l.nomComplet, l.classe, l.etat])).toEqual([
      ['Aliou CONDE', 'CP1', 'A_PAYER'],
      ['Djiné KANTE', '6eme A', 'A_PAYER'],
    ]);
  });

  it("calcule type, montant, reste et facture : la facture de l'admission fait foi, sinon le tarif du niveau", async () => {
    const { lignes } = await service.inscriptionsAPayer('ecole', { etat: 'TOUS' });
    const parEleve = Object.fromEntries(lignes.map((l) => [l.eleveId, l]));

    expect(parEleve.e1).toMatchObject({
      matricule: '383CR021',
      type: 'REINSCRIPTION',
      libelle: 'Réinscription',
      factureId: 'f1',
      montant: 40000,
      dejaPaye: 0,
      reste: 40000,
      etat: 'A_PAYER',
    });
    expect(parEleve.e2).toMatchObject({ type: 'INSCRIPTION', factureId: 'f2', montant: 75000, dejaPaye: 75000, reste: 0, etat: 'PAYEE' });
    expect(parEleve.e3).toMatchObject({ type: 'INSCRIPTION', factureId: null, montant: 55000, reste: 55000, etat: 'A_PAYER' });
    expect(parEleve.e4).toMatchObject({ factureId: null, montant: 0, reste: 0, etat: 'FRAIS_NON_DEFINIS' });
  });

  describe("type d'opération (inscription ou réinscription)", () => {
    it('filtre par type : le résumé suit le filtre', async () => {
      const reins = await service.inscriptionsAPayer('ecole', { type: 'REINSCRIPTION', etat: 'TOUS' });
      expect(reins.lignes.map((l) => l.eleveId)).toEqual(['e1']);
      expect(reins.resume).toMatchObject({ eleves: 1, aPayer: 1, payees: 0, resteTotal: 40000 });

      const insc = await service.inscriptionsAPayer('ecole', { type: 'INSCRIPTION', etat: 'TOUS' });
      expect(insc.lignes.map((l) => l.eleveId).sort()).toEqual(['e2', 'e3', 'e4']);
      expect(insc.resume).toMatchObject({ eleves: 3, aPayer: 1, payees: 1, fraisNonDefinis: 1 });
    });

    it("le type de la facture déjà générée fait foi, même quand la détection dirait autre chose (première année dans l'application)", async () => {
      // e2 n'a aucune inscription antérieure : détecté « inscription » ; sa facture dit « réinscription »
      prisma.facture.findMany.mockResolvedValue([
        { id: 'f2', eleveId: 'e2', libelle: 'Frais de réinscription - CP1', montantTotal: 40000, montantPaye: 0 },
      ]);

      const { lignes } = await service.inscriptionsAPayer('ecole', { etat: 'TOUS' });

      expect(lignes.find((l) => l.eleveId === 'e2')).toMatchObject({ type: 'REINSCRIPTION', libelle: 'Réinscription', montant: 40000 });
    });

    it("donne le frais de chaque type et dit si le type reste modifiable (tant que rien n'est versé)", async () => {
      prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([{ niveauId: 'n1', montant: 55000, montantReinscription: 30000 }]);
      prisma.facture.findMany.mockResolvedValue([
        { id: 'f2', eleveId: 'e2', libelle: "Frais d'inscription - CP1", montantTotal: 55000, montantPaye: 10000 },
      ]);

      const { lignes } = await service.inscriptionsAPayer('ecole', { etat: 'TOUS' });
      const parEleve = Object.fromEntries(lignes.map((l) => [l.eleveId, l]));

      expect(parEleve.e3.montants).toEqual({ INSCRIPTION: 55000, REINSCRIPTION: 30000 });
      expect(parEleve.e3.typeModifiable).toBe(true); // aucune facture
      expect(parEleve.e2.typeModifiable).toBe(false); // un versement a déjà été fait
    });
  });

  it('filtre par état : payées, frais non définis ou tous', async () => {
    const noms = async (etat: any) => (await service.inscriptionsAPayer('ecole', { etat })).lignes.map((l) => l.eleveId);
    expect(await noms('PAYEE')).toEqual(['e2']);
    expect(await noms('FRAIS_NON_DEFINIS')).toEqual(['e4']);
    expect((await noms('TOUS')).sort()).toEqual(['e1', 'e2', 'e3', 'e4']);
  });

  it("le résumé porte sur tous les élèves du filtre niveau/classe, quel que soit l'état affiché", async () => {
    const r = await service.inscriptionsAPayer('ecole', { etat: 'PAYEE' });
    expect(r.lignes).toHaveLength(1);
    expect(r.resume).toEqual({ eleves: 4, aPayer: 2, payees: 1, fraisNonDefinis: 1, resteTotal: 95000, encaisse: 75000 });
  });

  it("une partie déjà versée reste à payer, pour le reste seulement", async () => {
    prisma.facture.findMany.mockResolvedValue([{ id: 'f1', eleveId: 'e1', montantTotal: 40000, montantPaye: 15000 }]);
    const { lignes } = await service.inscriptionsAPayer('ecole');
    expect(lignes.find((l) => l.eleveId === 'e1')).toMatchObject({ dejaPaye: 15000, reste: 25000, etat: 'A_PAYER' });
  });

  it("se limite à l'année courante, aux inscrits EN_COURS et aux factures d'inscription non annulées", async () => {
    await service.inscriptionsAPayer('ecole');

    expect(prisma.inscription.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', anneeScolaireId: 'a1', statut: 'EN_COURS' });
    expect(prisma.facture.findMany.mock.calls[0][0].where).toMatchObject({
      ecoleId: 'ecole',
      anneeScolaireId: 'a1',
      type: 'INSCRIPTION',
      statut: { not: 'ANNULEE' },
    });
    expect(prisma.fraisInscriptionNiveau.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', anneeScolaireId: 'a1' });
    // la réinscription se détecte sur une AUTRE année
    expect(prisma.inscription.findMany.mock.calls[1][0].where).toMatchObject({ anneeScolaireId: { not: 'a1' } });
  });

  it('propose les niveaux et les classes de l\'année pour les filtres', async () => {
    const r = await service.inscriptionsAPayer('ecole');
    expect(r.filtres.niveaux).toEqual([{ id: 'n1', nom: 'CP1' }, { id: 'n6', nom: '6eme' }]);
    expect(r.filtres.classes).toEqual([
      { id: 'c1', nom: 'CP1', niveauId: 'n1' },
      { id: 'c6', nom: '6eme A', niveauId: 'n6' },
    ]);
  });

  it('filtre par niveau, ou par classe qui prime sur le niveau', async () => {
    await service.inscriptionsAPayer('ecole', { niveauId: 'n6' });
    expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({ classe: { niveauId: 'n6' } });

    prisma.inscription.findMany.mockClear();
    await service.inscriptionsAPayer('ecole', { niveauId: 'n6', classeId: 'c6' });
    const where = prisma.inscription.findMany.mock.calls[0][0].where;
    expect(where.classeId).toBe('c6');
    expect(where).not.toHaveProperty('classe');
  });

  it("refuse un niveau ou une classe inconnus, ou une classe d'un autre niveau, et l'absence d'année courante", async () => {
    await expect(service.inscriptionsAPayer('ecole', { niveauId: 'n-etranger' })).rejects.toThrow('Niveau invalide');
    await expect(service.inscriptionsAPayer('ecole', { classeId: 'c-etrangere' })).rejects.toThrow('Classe invalide');
    await expect(service.inscriptionsAPayer('ecole', { niveauId: 'n1', classeId: 'c6' })).rejects.toThrow("n'appartient pas à ce niveau");

    prisma.anneeScolaire.findFirst.mockResolvedValue(null);
    await expect(service.inscriptionsAPayer('ecole')).rejects.toThrow('Aucune année scolaire courante');
  });

  it("sans inscrit : liste vide, résumé à zéro, aucune recherche de factures ni de tarifs", async () => {
    prisma.inscription.findMany.mockResolvedValue([]);
    const r = await service.inscriptionsAPayer('ecole', { classeId: 'c1' });

    expect(r.lignes).toEqual([]);
    expect(r.resume).toEqual({ eleves: 0, aPayer: 0, payees: 0, fraisNonDefinis: 0, resteTotal: 0, encaisse: 0 });
    expect(prisma.facture.findMany).not.toHaveBeenCalled();
    expect(prisma.fraisInscriptionNiveau.findMany).not.toHaveBeenCalled();
  });
});
