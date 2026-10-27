import { ElevesService } from './eleves.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('ElevesService', () => {
  let prisma: any;
  let factures: { genererFacturesEnrolement: jest.Mock; annulerEcolageRegime: jest.Mock };
  let service: ElevesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    factures = {
      genererFacturesEnrolement: jest.fn().mockResolvedValue(undefined),
      annulerEcolageRegime: jest.fn().mockResolvedValue(undefined),
    };
    service = new ElevesService(prisma, factures as any);
  });

  describe('findAll', () => {
    it("ne liste que les élèves actifs de l'école, par ordre alphabétique", async () => {
      prisma.eleve.findMany.mockResolvedValue([]);
      await service.findAll('ecole');
      const args = prisma.eleve.findMany.mock.calls[0][0];
      expect(args.where).toEqual({ ecoleId: 'ecole', actif: true });
      expect(args.orderBy).toEqual({ nom: 'asc' });
    });

    const avecInscriptions = (id: string, ...inscriptions: { regime: string; courante: boolean }[]) => ({
      id,
      nom: id,
      adresse: 'Conakry',
      inscriptions: inscriptions.map((i) => ({ regime: i.regime, anneeScolaire: { courante: i.courante } })),
    });

    it("donne le régime de l'inscription en cours, de préférence celle de l'année courante", async () => {
      prisma.eleve.findMany.mockResolvedValue([
        avecInscriptions('e1', { regime: 'EXTERNAT', courante: false }, { regime: 'INTERNAT', courante: true }),
        avecInscriptions('e2', { regime: 'PENSIONNAT', courante: false }),
        avecInscriptions('e3'),
      ]);
      const r = await service.findAll('ecole');
      expect(r.map((e: any) => [e.id, e.regime])).toEqual([['e1', 'INTERNAT'], ['e2', 'PENSIONNAT'], ['e3', null]]);
      expect(r[0]).not.toHaveProperty('inscriptions');
    });

    it("filtre par régime (et par classe) sur l'inscription en cours", async () => {
      prisma.eleve.findMany.mockResolvedValue([
        avecInscriptions('e1', { regime: 'INTERNAT', courante: true }),
        avecInscriptions('e2', { regime: 'INTERNAT', courante: false }, { regime: 'EXTERNAT', courante: true }),
      ]);
      const r = await service.findAll('ecole', null, { classeId: 'c1', regime: 'INTERNAT' as any });
      expect(prisma.eleve.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        actif: true,
        inscriptions: { some: { statut: 'EN_COURS', classeId: 'c1', regime: 'INTERNAT' } },
      });
      // e2 est interne sur une ancienne année mais externe cette année : écarté
      expect(r.map((e: any) => e.id)).toEqual(['e1']);
    });

    it("pour un enseignant : ses classes seulement, sans l'adresse", async () => {
      prisma.eleve.findMany.mockResolvedValue([avecInscriptions('e1', { regime: 'EXTERNAT', courante: true })]);
      const r = await service.findAll('ecole', ['c1', 'c2'], { regime: 'EXTERNAT' as any });
      expect(prisma.eleve.findMany.mock.calls[0][0].where.inscriptions).toEqual({
        some: { statut: 'EN_COURS', classeId: { in: ['c1', 'c2'] }, regime: 'EXTERNAT' },
      });
      expect(r[0]).not.toHaveProperty('adresse');
    });
  });

  describe('majFiliation', () => {
    beforeEach(() => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1' });
      prisma.eleveParent.findMany.mockResolvedValue([]);
    });

    it('crée le père, met à jour la mère existante, ne touche pas à ce qui est absent', async () => {
      prisma.eleveParent.findFirst.mockImplementation(async ({ where }: any) =>
        where.lien === 'Mère' ? { id: 'l-mere', parentTuteurId: 'p-mere' } : null,
      );
      prisma.parentTuteur.create.mockResolvedValue({ id: 'p-pere' });

      await service.majFiliation('ecole', 'e1', {
        pere: { prenom: 'Kalilou', nom: 'Camara', telephone: '620000000', profession: '' },
        mere: { prenom: 'Aïssata', nom: 'Bah' },
      });

      expect(prisma.parentTuteur.create.mock.calls[0][0].data).toEqual({
        ecoleId: 'ecole', prenom: 'Kalilou', nom: 'Camara', telephone: '620000000', profession: null,
      });
      expect(prisma.eleveParent.create.mock.calls[0][0].data).toEqual({
        eleveId: 'e1', parentTuteurId: 'p-pere', lien: 'Père', contactPrincipal: false,
      });
      expect(prisma.parentTuteur.update.mock.calls[0][0]).toEqual({
        where: { id: 'p-mere' },
        data: { prenom: 'Aïssata', nom: 'Bah', telephone: null, profession: null },
      });
    });

    it('retire le lien quand la personne est vidée, et refuse un élève d\'une autre école', async () => {
      prisma.eleveParent.findFirst.mockResolvedValue({ id: 'l-pere', parentTuteurId: 'p-pere' });
      await service.majFiliation('ecole', 'e1', { pere: { prenom: ' ', nom: '' } });
      expect(prisma.eleveParent.delete).toHaveBeenCalledWith({ where: { id: 'l-pere' } });
      expect(prisma.eleveParent.findFirst).toHaveBeenCalledTimes(1); // la mère n'est pas touchée

      prisma.eleve.findFirst.mockResolvedValue(null);
      await expect(service.majFiliation('ecole', 'x', { pere: null })).rejects.toThrow('introuvable');
    });
  });

  describe('update', () => {
    it("convertit la date de naissance et vérifie l'appartenance à l'école", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      await service.update('ecole', 'e1', { nom: 'Camara', dateNaissance: '2015-04-10' } as any);

      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'e1', ecoleId: 'ecole' });
      const data = prisma.eleve.update.mock.calls[0][0].data;
      expect(data.nom).toBe('Camara');
      expect(data.dateNaissance).toEqual(new Date('2015-04-10'));
    });

    it("laisse la date de naissance inchangée quand elle n'est pas fournie", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      await service.update('ecole', 'e1', { nom: 'X' } as any);
      expect(prisma.eleve.update.mock.calls[0][0].data.dateNaissance).toBeUndefined();
    });
  });

  describe('remove (suppression définitive)', () => {
    beforeEach(() => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: null });
      for (const m of ['facture', 'note', 'absence', 'inscription', 'inscriptionFormation', 'emprunt', 'messageParent', 'demandeInscription']) {
        prisma[m].count.mockResolvedValue(2);
      }
      prisma.paiement.count.mockResolvedValue(3);
      prisma.eleveParent.findMany.mockResolvedValue([{ parentTuteurId: 'p1' }, { parentTuteurId: 'p2' }]);
      // p2 reste lié à un autre élève (fratrie)
      prisma.eleveParent.findFirst.mockImplementation(async ({ where }: any) => (where.parentTuteurId === 'p2' ? { id: 'autre' } : null));
      prisma.demandeInscription.findMany.mockResolvedValue([{ id: 'd1' }]);
    });

    it("supprime l'élève et tout ce qui le concerne dans une seule transaction, et renvoie le bilan", async () => {
      const r = await service.remove('ecole', 'e1', '2026');

      expect(r).toEqual({
        supprime: true,
        factures: 2,
        paiements: 3,
        notes: 2,
        absences: 2,
        inscriptions: 2,
        formations: 2,
        emprunts: 2,
        messages: 2,
        demandes: 2,
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.paiement.deleteMany).toHaveBeenCalledWith({ where: { facture: { eleveId: 'e1' } } });
      for (const m of ['facture', 'note', 'absence', 'emprunt', 'inscriptionFormation', 'inscription', 'eleveParent']) {
        expect(prisma[m].deleteMany).toHaveBeenCalledWith({ where: { eleveId: 'e1' } });
      }
      expect(prisma.parentTuteur.delete).toHaveBeenCalledWith({ where: { id: 'p1' } });
      expect(prisma.parentTuteur.delete).toHaveBeenCalledTimes(1); // p2 gardé (autre enfant)
      expect(prisma.annulationAdmission.deleteMany).toHaveBeenCalledWith({ where: { demandeId: { in: ['d1'] } } });
      expect(prisma.eleve.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
    });

    it('exige le code de suppression : sans code ou avec un mauvais code, rien ne change', async () => {
      await expect(service.remove('ecole', 'e1')).rejects.toThrow('code de suppression est requis');
      await expect(service.remove('ecole', 'e1', '2025')).rejects.toThrow('Code de suppression incorrect');
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(prisma.eleve.delete).not.toHaveBeenCalled();
    });
  });

  describe('fiche', () => {
    const eleve = (factures: any[]) => ({
      id: 'e1',
      inscriptions: [],
      parentsLiens: [],
      factures,
      demandesInscription: [],
    });

    it("calcule le solde (reste dû sur toutes les factures) et les absences de l'année courante", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue(
        eleve([
          { montantTotal: 500000, montantPaye: 200000 },
          { montantTotal: 100000, montantPaye: 100000 },
        ]),
      );
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.absence.count.mockResolvedValue(4);

      const f = await service.fiche('ecole', 'e1');

      expect(f.solde).toBe(300000);
      expect(f.absencesCount).toBe(4);
      expect(prisma.absence.count.mock.calls[0][0].where).toMatchObject({
        eleveId: 'e1',
        statut: { in: ['ABSENT', 'RETARD'] },
        anneeScolaireId: 'a1',
      });
    });

    it("sans année courante, ne restreint pas les absences à une année", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue(eleve([]));
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      prisma.absence.count.mockResolvedValue(0);

      await service.fiche('ecole', 'e1');
      expect(prisma.absence.count.mock.calls[0][0].where.anneeScolaireId).toBeUndefined();
    });

    it("n'inclut que les inscriptions EN_COURS", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue(eleve([]));
      prisma.absence.count.mockResolvedValue(0);
      await service.fiche('ecole', 'e1');
      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].include.inscriptions.where).toEqual({ statut: 'EN_COURS' });
    });
  });

  describe('inscrire (affectation à une classe)', () => {
    beforeEach(() => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1', anneeScolaireId: 'a-classe' });
      prisma.inscription.upsert.mockResolvedValue({ id: 'i1' });
    });

    it("rattache l'inscription à l'année de la classe choisie (jamais l'année courante) et déclenche la facturation", async () => {
      const r = await service.inscrire('ecole', { eleveId: 'e1', classeId: 'c1' } as any);

      expect(r).toEqual({ id: 'i1' });
      const up = prisma.inscription.upsert.mock.calls[0][0];
      expect(up.where).toEqual({ eleveId_anneeScolaireId: { eleveId: 'e1', anneeScolaireId: 'a-classe' } });
      expect(up.update).toEqual({ classeId: 'c1' });
      expect(up.create).toMatchObject({ ecoleId: 'ecole', eleveId: 'e1', classeId: 'c1', anneeScolaireId: 'a-classe' });
      expect(factures.genererFacturesEnrolement).toHaveBeenCalledWith('ecole', 'e1', 'c1', 'a-classe');
    });

    it("changement de régime : annule l'écolage de l'ancien régime avant de refacturer", async () => {
      prisma.inscription.findUnique.mockResolvedValue({ regime: 'INTERNAT', classe: { niveauId: 'n-ps' } });
      await service.inscrire('ecole', { eleveId: 'e1', classeId: 'c1', regime: 'PENSIONNAT' } as any);
      expect(factures.annulerEcolageRegime).toHaveBeenCalledWith('ecole', 'e1', 'a-classe', 'n-ps', 'INTERNAT');
      expect(prisma.inscription.upsert.mock.calls[0][0].update).toEqual({ classeId: 'c1', regime: 'PENSIONNAT' });
      expect(factures.genererFacturesEnrolement).toHaveBeenCalled();
    });

    it("régime absent ou identique : rien n'est annulé", async () => {
      prisma.inscription.findUnique.mockResolvedValue({ regime: 'INTERNAT', classe: { niveauId: 'n-ps' } });
      await service.inscrire('ecole', { eleveId: 'e1', classeId: 'c1' } as any);
      await service.inscrire('ecole', { eleveId: 'e1', classeId: 'c1', regime: 'INTERNAT' } as any);
      expect(factures.annulerEcolageRegime).not.toHaveBeenCalled();
    });

    it("vérifie que l'élève ET la classe appartiennent à l'école", async () => {
      await service.inscrire('ecole-A', { eleveId: 'e1', classeId: 'c1' } as any);
      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'e1', ecoleId: 'ecole-A' });
      expect(prisma.classe.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'c1', ecoleId: 'ecole-A' });
    });
  });

  describe('parents', () => {
    it("liste les parents de l'école", async () => {
      prisma.parentTuteur.findMany.mockResolvedValue([]);
      await service.findAllParents('ecole');
      expect(prisma.parentTuteur.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole' });
    });

    it("lie un parent à un élève de la même école, contact principal faux par défaut", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.parentTuteur.findFirstOrThrow.mockResolvedValue({ id: 'p1' });

      await service.linkParent('ecole', 'e1', { parentTuteurId: 'p1', lien: 'Père' } as any);

      expect(prisma.eleveParent.create.mock.calls[0][0].data).toEqual({
        eleveId: 'e1',
        parentTuteurId: 'p1',
        lien: 'Père',
        contactPrincipal: false,
      });
    });
  });
});
