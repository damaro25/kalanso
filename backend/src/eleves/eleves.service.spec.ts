import { ElevesService } from './eleves.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('ElevesService', () => {
  let prisma: any;
  let factures: { genererFacturesEnrolement: jest.Mock };
  let service: ElevesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    factures = { genererFacturesEnrolement: jest.fn().mockResolvedValue(undefined) };
    service = new ElevesService(prisma, factures as any);
  });

  describe('findAll', () => {
    it("ne liste que les élèves actifs de l'école, par ordre alphabétique", async () => {
      prisma.eleve.findMany.mockResolvedValue([]);
      await service.findAll('ecole');
      expect(prisma.eleve.findMany.mock.calls[0][0]).toEqual({ where: { ecoleId: 'ecole', actif: true }, orderBy: { nom: 'asc' } });
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

  describe('remove (radiation)', () => {
    it("désactive l'élève ET clôt ses inscriptions en cours (ABANDONNEE) dans une même transaction", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.eleve.update.mockResolvedValue({ id: 'e1', actif: false });

      const r = await service.remove('ecole', 'e1');

      expect(r).toEqual({ id: 'e1', actif: false });
      expect(prisma.eleve.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { actif: false } });
      expect(prisma.inscription.updateMany).toHaveBeenCalledWith({
        where: { eleveId: 'e1', ecoleId: 'ecole', statut: 'EN_COURS' },
        data: { statut: 'ABANDONNEE' },
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
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
