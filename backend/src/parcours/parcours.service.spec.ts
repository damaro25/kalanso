import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ParcoursService, SEUIL_PASSAGE } from './parcours.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('ParcoursService', () => {
  let prisma: any;
  let factures: { genererFacturesEnrolement: jest.Mock };
  let service: ParcoursService;

  beforeEach(() => {
    prisma = createPrismaMock();
    factures = { genererFacturesEnrolement: jest.fn().mockResolvedValue(undefined) };
    service = new ParcoursService(prisma, factures as any);
  });

  it('le seuil de passage est 5/10', () => {
    expect(SEUIL_PASSAGE).toBe(5);
  });

  describe('parcoursClasse', () => {
    const classe = { id: 'c1', anneeScolaireId: 'a1', niveau: { nom: '5eme' }, anneeScolaire: { libelle: '2026-2027' } };

    // notes de test : une note par trimestre pour l'élève
    function notes(parTrimestre: Record<number, number | null>) {
      prisma.note.findMany.mockImplementation(async ({ where }: any) => {
        const v = parTrimestre[where.trimestre];
        return v === null || v === undefined ? [] : [{ valeur: v, matiere: { coefficient: 1 } }];
      });
    }

    beforeEach(() => {
      prisma.classe.findFirst.mockResolvedValue(classe);
      prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1', eleve: { id: 'e1', nom: 'A' } }]);
    });

    it('lève NotFound si la classe est introuvable', async () => {
      prisma.classe.findFirst.mockResolvedValue(null);
      await expect(service.parcoursClasse('ecole', 'x')).rejects.toThrow(NotFoundException);
    });

    it('moyenne annuelle = (T1+T2+T3)/3 quand les 3 trimestres sont notés', async () => {
      notes({ 1: 6, 2: 7, 3: 8 });
      const r = await service.parcoursClasse('ecole', 'c1');
      expect(r.parcours[0].moyenneAnnuelle).toBeCloseTo(7, 5);
      expect(r.parcours[0].decision).toBe('ADMIS');
    });

    it('un trimestre sans note compte pour 0 (jamais la moyenne des seuls trimestres renseignés)', async () => {
      notes({ 1: 9, 2: null, 3: null });
      const r = await service.parcoursClasse('ecole', 'c1');
      expect(r.parcours[0].moyenneTrimestre1).toBe(9);
      expect(r.parcours[0].moyenneTrimestre2).toBeNull();
      expect(r.parcours[0].moyenneTrimestre3).toBeNull();
      expect(r.parcours[0].moyenneAnnuelle).toBeCloseTo(3, 5); // 9/3, pas 9
      expect(r.parcours[0].decision).toBe('REDOUBLE');
    });

    it('sans aucune note : moyenne 0 et décision REDOUBLE', async () => {
      notes({ 1: null, 2: null, 3: null });
      const r = await service.parcoursClasse('ecole', 'c1');
      expect(r.parcours[0].moyenneAnnuelle).toBe(0);
      expect(r.parcours[0].decision).toBe('REDOUBLE');
    });

    it('la limite exacte du seuil (5.0) donne ADMIS, juste en dessous REDOUBLE', async () => {
      notes({ 1: 5, 2: 5, 3: 5 });
      expect((await service.parcoursClasse('ecole', 'c1')).parcours[0].decision).toBe('ADMIS');
      notes({ 1: 5, 2: 5, 3: 4.9 });
      expect((await service.parcoursClasse('ecole', 'c1')).parcours[0].decision).toBe('REDOUBLE');
    });

    it('ne considère que les inscriptions EN_COURS de la classe', async () => {
      notes({ 1: 6, 2: 6, 3: 6 });
      await service.parcoursClasse('ecole', 'c1');
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({
        classeId: 'c1',
        statut: 'EN_COURS',
      });
    });
  });

  describe('classesDestination', () => {
    it("propose les classes du niveau actuel (redoublement) et du niveau supérieur, d'autres années", async () => {
      prisma.classe.findFirst.mockResolvedValue({
        id: 'c1',
        niveauId: 'n5',
        anneeScolaireId: 'a1',
        niveau: { id: 'n5', ordre: 5 },
      });
      prisma.niveau.findFirst.mockResolvedValue({ id: 'n6', ordre: 6 });
      prisma.classe.findMany.mockResolvedValue([]);

      await service.classesDestination('ecole', 'c1');

      expect(prisma.niveau.findFirst.mock.calls[0][0].where).toMatchObject({ ordre: 6 });
      const where = prisma.classe.findMany.mock.calls[0][0].where;
      expect(where.anneeScolaireId).toEqual({ not: 'a1' });
      expect(where.niveauId).toEqual({ in: ['n5', 'n6'] });
    });

    it("sans niveau supérieur, ne propose que le niveau actuel", async () => {
      prisma.classe.findFirst.mockResolvedValue({
        id: 'c1',
        niveauId: 'n9',
        anneeScolaireId: 'a1',
        niveau: { id: 'n9', ordre: 9 },
      });
      prisma.niveau.findFirst.mockResolvedValue(null);
      prisma.classe.findMany.mockResolvedValue([]);

      await service.classesDestination('ecole', 'c1');
      expect(prisma.classe.findMany.mock.calls[0][0].where.niveauId).toBe('n9');
    });
  });

  describe('validerPassage', () => {
    const classeDest = { id: 'cd', anneeScolaireId: 'a2' };

    beforeEach(() => {
      prisma.classe.findFirst.mockResolvedValue(classeDest);
      prisma.inscription.findFirst.mockResolvedValue({ id: 'i1' });
      prisma.inscription.findUnique.mockResolvedValue(null);
    });

    it("clôture l'ancienne inscription, crée la nouvelle puis facture (réinscription)", async () => {
      const r = await service.validerPassage('ecole', { entries: [{ eleveId: 'e1', classeDestinationId: 'cd' }] } as any);

      expect(r).toEqual({ reussies: 1, echecs: [] });
      expect(prisma.inscription.update.mock.calls[0][0]).toMatchObject({ where: { id: 'i1' }, data: { statut: 'TERMINEE' } });
      expect(prisma.inscription.create.mock.calls[0][0].data).toMatchObject({
        eleveId: 'e1',
        classeId: 'cd',
        anneeScolaireId: 'a2',
      });
      expect(factures.genererFacturesEnrolement).toHaveBeenCalledWith('ecole', 'e1', 'cd', 'a2');
    });

    it('signale une classe de destination invalide sans bloquer les autres élèves', async () => {
      prisma.classe.findFirst
        .mockResolvedValueOnce(null) // 1er élève : classe invalide
        .mockResolvedValueOnce(classeDest); // 2e élève : ok

      const r = await service.validerPassage('ecole', {
        entries: [
          { eleveId: 'e1', classeDestinationId: 'bad' },
          { eleveId: 'e2', classeDestinationId: 'cd' },
        ],
      } as any);

      expect(r.reussies).toBe(1);
      expect(r.echecs).toEqual([{ eleveId: 'e1', erreur: 'Classe de destination invalide' }]);
    });

    it("refuse un élève sans inscription en cours", async () => {
      prisma.inscription.findFirst.mockResolvedValue(null);
      const r = await service.validerPassage('ecole', { entries: [{ eleveId: 'e1', classeDestinationId: 'cd' }] } as any);
      expect(r.reussies).toBe(0);
      expect(r.echecs[0].erreur).toBe("Cet élève n'a pas d'inscription en cours");
      expect(factures.genererFacturesEnrolement).not.toHaveBeenCalled();
    });

    it("refuse un élève déjà inscrit pour l'année de destination", async () => {
      prisma.inscription.findUnique.mockResolvedValue({ id: 'deja' });
      const r = await service.validerPassage('ecole', { entries: [{ eleveId: 'e1', classeDestinationId: 'cd' }] } as any);
      expect(r.echecs[0].erreur).toBe('Cet élève a déjà une inscription pour cette année scolaire');
      expect(prisma.inscription.create).not.toHaveBeenCalled();
    });
  });
});
