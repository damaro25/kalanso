import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { FacturesService } from './factures.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('FacturesService', () => {
  let prisma: any;
  let service: FacturesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new FacturesService(prisma);
    prisma.facture.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
  });

  describe('create (facture ponctuelle)', () => {
    it("rattache la facture à l'année courante par défaut", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a-courante' });

      await service.create('ecole', { eleveId: 'e1', libelle: 'Cantine', montantTotal: 15000 } as any);

      expect(prisma.facture.create.mock.calls[0][0].data).toMatchObject({
        eleveId: 'e1',
        anneeScolaireId: 'a-courante',
        libelle: 'Cantine',
        montantTotal: 15000,
      });
    });

    it("utilise l'année fournie sans consulter l'année courante", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      await service.create('ecole', { eleveId: 'e1', libelle: 'X', montantTotal: 1, anneeScolaireId: 'a-choisie' } as any);
      expect(prisma.anneeScolaire.findFirst).not.toHaveBeenCalled();
      expect(prisma.facture.create.mock.calls[0][0].data.anneeScolaireId).toBe('a-choisie');
    });

    it("refuse quand aucune année courante n'est définie", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(
        service.create('ecole', { eleveId: 'e1', libelle: 'X', montantTotal: 1 } as any),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('genererFacturesEnrolement', () => {
    const classe = { id: 'c1', nom: '5eme A', niveauId: 'n5' };

    beforeEach(() => {
      prisma.classe.findFirst.mockResolvedValue(classe);
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: null });
      prisma.tarifEcolage.findMany.mockResolvedValue([]);
      prisma.facture.findFirst.mockResolvedValue(null);
      prisma.inscription.findFirst.mockResolvedValue(null); // aucune inscription antérieure
    });

    const facturesCreees = () => prisma.facture.create.mock.calls.map((c: any) => c[0].data);

    it("ne fait rien si la classe n'existe pas dans l'école", async () => {
      prisma.classe.findFirst.mockResolvedValue(null);
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      expect(prisma.facture.create).not.toHaveBeenCalled();
    });

    it("nouvel élève : facture « Frais d'inscription » au tarif nouveaux, créée IMPAYÉE et sans paiement (plus réglée à l'admission)", async () => {
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');

      const [f] = facturesCreees();
      expect(f).toMatchObject({
        libelle: "Frais d'inscription - 5eme A",
        type: 'INSCRIPTION',
        montantTotal: 75000,
      });
      // ni montant payé, ni statut soldé, ni paiement automatique : le statut par défaut du schéma est IMPAYEE
      expect(f.montantPaye).toBeUndefined();
      expect(f.statut).toBeUndefined();
      expect(f.paiements).toBeUndefined();
    });

    it("l'élève déjà inscrit une année antérieure est en réinscription : tarif et libellé dédiés", async () => {
      prisma.inscription.findFirst.mockResolvedValue({ id: 'ancienne' });
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: 40000 });

      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a2');

      const [f] = facturesCreees();
      expect(f.libelle).toBe('Frais de réinscription - 5eme A');
      expect(f.montantTotal).toBe(40000);
      // la détection porte sur une inscription d'une AUTRE année
      expect(prisma.inscription.findFirst.mock.calls[0][0].where).toMatchObject({
        eleveId: 'e1',
        anneeScolaireId: { not: 'a2' },
      });
    });

    it('réinscription sans tarif dédié : retombe sur le tarif nouveaux', async () => {
      prisma.inscription.findFirst.mockResolvedValue({ id: 'ancienne' });
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: null });

      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a2');

      expect(facturesCreees()[0].montantTotal).toBe(75000);
      expect(facturesCreees()[0].libelle).toContain('réinscription');
    });

    it("un nouvel élève ne paie jamais le tarif de réinscription, même s'il est défini", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue({ montant: 75000, montantReinscription: 10000 });
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      expect(facturesCreees()[0].montantTotal).toBe(75000);
    });

    it("sans frais d'inscription défini pour le niveau, aucune facture d'inscription n'est créée", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      expect(facturesCreees().filter((f: any) => f.type === 'INSCRIPTION')).toHaveLength(0);
    });

    it("idempotent : ne recrée pas une facture d'inscription déjà soldée", async () => {
      prisma.facture.findFirst.mockResolvedValue({ id: 'existante', montantTotal: 75000, montantPaye: 75000 });
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      expect(prisma.facture.create).not.toHaveBeenCalled();
      expect(prisma.facture.update).not.toHaveBeenCalled();
    });

    it("ne solde jamais automatiquement une facture d'inscription restée impayée ou partielle", async () => {
      for (const montantPaye of [0, 25000]) {
        prisma.facture.findFirst.mockResolvedValue({ id: 'ancienne', montantTotal: 75000, montantPaye });

        await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
      }

      // aucune mise à jour (donc aucun paiement « régularisation »), aucune nouvelle facture
      expect(prisma.facture.update).not.toHaveBeenCalled();
      expect(prisma.facture.create).not.toHaveBeenCalled();
      expect(prisma.paiement.create).not.toHaveBeenCalled();
    });

    it("crée une facture d'écolage par tarif du niveau, impayée", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
      prisma.tarifEcolage.findMany.mockResolvedValue([
        { libelle: 'Trimestre 1', montant: 500000 },
        { libelle: 'Trimestre 2', montant: 500000 },
      ]);

      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');

      const factures = facturesCreees();
      expect(factures).toHaveLength(2);
      expect(factures[0]).toMatchObject({ libelle: 'Trimestre 1', type: 'ECOLAGE', montantTotal: 500000 });
      expect(factures[0].statut).toBeUndefined(); // statut par défaut du schéma : IMPAYEE
    });

    it("idempotent par libellé d'écolage : couvre seulement les tarifs ajoutés après coup", async () => {
      prisma.fraisInscriptionNiveau.findFirst.mockResolvedValue(null);
      prisma.tarifEcolage.findMany.mockResolvedValue([
        { libelle: 'Trimestre 1', montant: 500000 },
        { libelle: 'Trimestre 2', montant: 500000 },
      ]);
      prisma.facture.findFirst.mockImplementation(async ({ where }: any) =>
        where.libelle === 'Trimestre 1' ? { id: 'deja' } : null,
      );

      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');

      expect(facturesCreees().map((f: any) => f.libelle)).toEqual(['Trimestre 2']);
    });

    it("les tarifs sont cherchés pour le niveau de la classe et l'année demandée", async () => {
      await service.genererFacturesEnrolement('ecole', 'e1', 'c1', 'a9');
      expect(prisma.tarifEcolage.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        niveauId: 'n5',
        anneeScolaireId: 'a9',
      });
    });
  });

  describe('regenererFacturesManquantes', () => {
    it("parcourt les inscriptions EN_COURS de l'année courante et régénère pour chacune", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.inscription.findMany.mockResolvedValue([
        { eleveId: 'e1', classeId: 'c1' },
        { eleveId: 'e2', classeId: 'c2' },
      ]);
      const spy = jest.spyOn(service, 'genererFacturesEnrolement').mockResolvedValue(undefined);

      const r = await service.regenererFacturesManquantes('ecole');

      expect(r).toEqual({ eleveTraites: 2 });
      expect(spy).toHaveBeenCalledWith('ecole', 'e1', 'c1', 'a1');
      expect(spy).toHaveBeenCalledWith('ecole', 'e2', 'c2', 'a1');
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({
        anneeScolaireId: 'a1',
        statut: 'EN_COURS',
      });
    });

    it("refuse sans année courante ni année fournie", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.regenererFacturesManquantes('ecole')).rejects.toThrow(BadRequestException);
    });
  });

  describe('findImpayes', () => {
    beforeEach(() => {
      prisma.facture.findMany.mockResolvedValue([]);
    });

    it("se limite aux impayés de l'année courante (même périmètre que le tableau de bord)", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce({ id: 'a-courante' });

      await service.findImpayes('ecole');

      expect(prisma.facture.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        anneeScolaireId: 'a-courante',
        statut: { in: ['IMPAYEE', 'PARTIELLE'] },
      });
    });

    it("à défaut d'année courante, retombe sur la plus récente", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a-recente' });

      await service.findImpayes('ecole');

      expect(prisma.anneeScolaire.findFirst.mock.calls[1][0].orderBy).toEqual({ dateDebut: 'desc' });
      expect(prisma.facture.findMany.mock.calls[0][0].where.anneeScolaireId).toBe('a-recente');
    });

    it("trie par échéance croissante et inclut l'élève", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      await service.findImpayes('ecole');
      const arg = prisma.facture.findMany.mock.calls[0][0];
      expect(arg.orderBy).toEqual({ dateEcheance: 'asc' });
      expect(arg.include).toEqual({ eleve: true });
    });
  });

  describe('soldeEleve', () => {
    it('somme les restes à payer de toutes les factures', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.facture.findMany.mockResolvedValue([
        { montantTotal: 500000, montantPaye: 200000 },
        { montantTotal: 100000, montantPaye: 100000 },
        { montantTotal: 60000, montantPaye: 0 },
      ]);
      expect(await service.soldeEleve('ecole', 'e1')).toEqual({ eleveId: 'e1', solde: 360000 });
    });
  });

  describe('importXlsx (factures ponctuelles)', () => {
    async function classeur(rows: any[][]): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Factures');
      rows.forEach((r) => ws.addRow(r));
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    beforeEach(() => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.eleve.findMany.mockResolvedValue([
        { id: 'e1', matricule: 'M001', nom: 'Camara', prenom: 'Laby' },
        { id: 'e2', matricule: null, nom: 'Conde', prenom: 'Aliou' },
      ]);
    });

    it('crée une facture de type AUTRE par ligne valide, par matricule ou par nom+prénom', async () => {
      const buf = await classeur([
        ['Matricule', 'Nom', 'Prénom', 'Libellé', 'Montant'],
        ['M001', '', '', 'Cantine', 20000],
        ['', 'conde', 'ALIOU', 'Transport', 30000],
      ]);

      const r = await service.importXlsx('ecole', buf);

      expect(r.creees).toBe(2);
      expect(r.erreurs).toEqual([]);
      const crees = prisma.facture.create.mock.calls.map((c: any) => c[0].data);
      expect(crees[0]).toMatchObject({ eleveId: 'e1', libelle: 'Cantine', type: 'AUTRE', montantTotal: 20000, anneeScolaireId: 'a1' });
      expect(crees[1]).toMatchObject({ eleveId: 'e2', libelle: 'Transport', montantTotal: 30000 });
    });

    it("signale élève introuvable, libellé manquant et montant invalide sans bloquer les autres lignes", async () => {
      const buf = await classeur([
        ['Matricule', 'Libellé', 'Montant'],
        ['INCONNU', 'Cantine', 1000],
        ['M001', '', 1000],
        ['M001', 'Sortie', -5],
        ['M001', 'Sortie', 'abc'],
        ['M001', 'Uniforme', 8000],
      ]);

      const r = await service.importXlsx('ecole', buf);

      expect(r.creees).toBe(1);
      expect(r.erreurs.map((e) => [e.ligne, e.motif])).toEqual([
        [2, 'Élève introuvable (INCONNU)'],
        [3, 'Libellé manquant'],
        [4, 'Montant invalide'],
        [5, 'Montant invalide'],
      ]);
    });

    it('lit une date d\'échéance au format texte', async () => {
      const buf = await classeur([
        ['Matricule', 'Libellé', 'Montant', 'Date échéance'],
        ['M001', 'Cantine', 5000, '2026-12-31'],
      ]);
      await service.importXlsx('ecole', buf);
      expect(prisma.facture.create.mock.calls[0][0].data.dateEcheance).toEqual(new Date('2026-12-31'));
    });

    it('refuse un fichier dont les colonnes obligatoires manquent', async () => {
      const buf = await classeur([['Nom', 'Montant'], ['Camara', 1000]]);
      await expect(service.importXlsx('ecole', buf)).rejects.toThrow('Colonnes attendues');
    });

    it("refuse l'import sans année courante", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      const buf = await classeur([['Matricule', 'Libellé', 'Montant'], ['M001', 'X', 100]]);
      await expect(service.importXlsx('ecole', buf)).rejects.toThrow("Aucune année scolaire courante");
    });
  });
});
