import * as ExcelJS from 'exceljs';
import { BadRequestException } from '@nestjs/common';
import { ExportService } from './export.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

async function lire(buffer: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  return wb.worksheets[0];
}

const lignes = (sheet: ExcelJS.Worksheet) => {
  const out: unknown[][] = [];
  sheet.eachRow((row) => out.push((row.values as unknown[]).slice(1)));
  return out;
};

describe('ExportService (exports Excel)', () => {
  let prisma: any;
  let service: ExportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new ExportService(prisma, {} as any, {} as any, {} as any, {} as any);
  });

  describe('périmètre année scolaire', () => {
    it('refuse quand aucune année scolaire n\'existe', async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue(null);
      await expect(service.elevesXlsx('ecole')).rejects.toThrow(BadRequestException);
    });

    it("à défaut d'année courante, retombe sur la plus récente", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'a-recente' });
      prisma.inscription.findMany.mockResolvedValue([]);
      await service.elevesXlsx('ecole');
      expect(prisma.inscription.findMany.mock.calls[0][0].where.anneeScolaireId).toBe('a-recente');
    });
  });

  describe('elevesXlsx', () => {
    it("exporte les élèves inscrits EN_COURS de l'année courante, filtrables par classe", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.inscription.findMany.mockResolvedValue([
        { eleve: { matricule: 'M1', nom: 'Diallo', prenom: 'Fatou', genre: 'F' }, classe: { nom: '5eme A' } },
        { eleve: { matricule: null, nom: 'Bah', prenom: 'Moussa', genre: 'M' }, classe: { nom: '5eme A' } },
      ]);

      const sheet = await lire(await service.elevesXlsx('ecole', 'c1'));

      expect(prisma.inscription.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        anneeScolaireId: 'a1',
        statut: 'EN_COURS',
        classeId: 'c1',
      });
      const l = lignes(sheet);
      expect(l[0]).toEqual(['Matricule', 'Nom', 'Prénom', 'Genre', 'Classe']);
      expect(l[1]).toEqual(['M1', 'Diallo', 'Fatou', 'F', '5eme A']);
      expect(l[2][1]).toBe('Bah');
    });
  });

  describe('impayesXlsx', () => {
    it("liste les impayés de l'année courante avec le reste à payer", async () => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.facture.findMany.mockResolvedValue([
        { eleve: { prenom: 'Fatou', nom: 'Diallo' }, libelle: 'Écolage', montantTotal: 500000, montantPaye: 200000, statut: 'PARTIELLE' },
      ]);

      const sheet = await lire(await service.impayesXlsx('ecole'));

      expect(prisma.facture.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        anneeScolaireId: 'a1',
        statut: { in: ['IMPAYEE', 'PARTIELLE'] },
      });
      expect(lignes(sheet)[1]).toEqual(['Fatou Diallo', 'Écolage', 500000, 200000, 300000, 'PARTIELLE']);
    });
  });

  describe('facturesXlsx', () => {
    it("exporte toutes les factures de l'école avec une colonne Année scolaire", async () => {
      prisma.facture.findMany.mockResolvedValue([
        {
          eleve: { matricule: 'M1', prenom: 'Fatou', nom: 'Diallo' },
          anneeScolaire: { libelle: '2025-2026' },
          libelle: 'Écolage T1',
          type: 'ECOLAGE',
          montantTotal: 300000,
          montantPaye: 300000,
          statut: 'PAYEE',
          dateEcheance: null,
        },
        {
          eleve: { matricule: null, prenom: 'Moussa', nom: 'Bah' },
          anneeScolaire: { libelle: '2026-2027' },
          libelle: 'Cantine',
          type: 'PONCTUELLE',
          montantTotal: 15000,
          montantPaye: 0,
          statut: 'IMPAYEE',
          dateEcheance: new Date('2026-11-30T12:00:00Z'),
        },
      ]);

      const sheet = await lire(await service.facturesXlsx('ecole'));

      expect(prisma.facture.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole' });
      expect(prisma.facture.findMany.mock.calls[0][0].include).toEqual({ eleve: true, anneeScolaire: true });

      const l = lignes(sheet);
      expect(l[0]).toEqual([
        'Matricule',
        'Élève',
        'Année scolaire',
        'Libellé',
        'Type',
        'Montant total',
        'Montant payé',
        'Reste à payer',
        'Statut',
        "Date d'échéance",
      ]);
      expect(l[1].slice(0, 9)).toEqual(['M1', 'Fatou Diallo', '2025-2026', 'Écolage T1', 'ECOLAGE', 300000, 300000, 0, 'PAYEE']);
      expect(l[2].slice(0, 9)).toEqual(['', 'Moussa Bah', '2026-2027', 'Cantine', 'PONCTUELLE', 15000, 0, 15000, 'IMPAYEE']);
    });
  });

  describe('cahierPaieXlsx', () => {
    it('la masse salariale compte aussi les brouillons, rappelés à part', async () => {
      const paie = {
        findByMois: jest.fn().mockResolvedValue([
          { personnel: { matricule: 'A01', nom: 'Touré', prenom: 'Makalé' }, statut: 'VALIDE', totalGains: 400, totalRetenues: 0, netAPayer: 400 },
          { personnel: { matricule: null, nom: 'Bah', prenom: 'Aissatou' }, statut: 'BROUILLON', totalGains: 150, totalRetenues: 0, netAPayer: 150 },
        ]),
      };
      const exports = new ExportService(prisma, {} as any, paie as any, {} as any, {} as any);

      const sheet = await lire(await exports.cahierPaieXlsx('ecole', 9, 2026));

      const l = lignes(sheet);
      const masse = l.find((r) => String(r[3]).startsWith('MASSE SALARIALE'));
      expect(masse?.[3]).toBe('MASSE SALARIALE (net) :');
      expect(masse?.[6]).toBe(550); // 400 validés + 150 en brouillon
      const brouillon = l.find((r) => String(r[3]).startsWith('dont brouillons'));
      expect(brouillon?.[6]).toBe(150);
    });
  });

  describe('modèles d\'import', () => {
    it('le modèle de factures contient les colonnes attendues par FacturesService.importXlsx', async () => {
      const sheet = await lire(await service.factureModeleXlsx());
      expect(lignes(sheet)[0]).toEqual(['Matricule', 'Nom', 'Prénom', 'Libellé', 'Montant', 'Date échéance']);
    });

    it('le modèle de paie contient les colonnes attendues par PaieService.importXlsx', async () => {
      const sheet = await lire(await service.paieModeleXlsx());
      expect(lignes(sheet)[0]).toEqual([
        'Matricule',
        'Nom',
        'Prénom',
        'Mois',
        'Année',
        'Libellé',
        'Montant gain',
        'Montant retenue',
        'Imposable',
        'Mode de paiement',
      ]);
    });
  });
});
