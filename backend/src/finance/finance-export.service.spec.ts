import * as ExcelJS from 'exceljs';
import { Logger } from '@nestjs/common';
import { FinanceExportService } from './finance-export.service';
import { SmsSimuleService } from '../communication/sms.service';

describe('FinanceExportService.bilanXlsx', () => {
  const dashboard = {
    anneeScolaire: { libelle: '2026-2027' },
    moisCourant: 'octobre 2026',
    ecolage: { totalFacture: 1000, totalEncaisse: 600, totalRestant: 400, tauxRecouvrement: 60 },
    inscription: { totalFacture: 200, totalEncaisse: 200, totalRestant: 0, tauxRecouvrement: 100 },
    eleves: { nbInscrits: 10, nbAJour: 6, nbEnRetard: 3, nbSansFacture: 1 },
    salaires: { masseSalarialeMois: 300, masseSalarialeCumul: 900 },
    compteResultat: {
      ecolageEncaisse: 600,
      inscriptionEncaisse: 200,
      autresRecettes: 50,
      recettesTotales: 850,
      depensesSalaires: 900,
      depensesAutres: 20,
      depensesTotales: 920,
      resultatNet: -70,
    },
  };

  it('produit les quatre feuilles à partir du tableau de bord, en transmettant l\'année demandée', async () => {
    const finance = {
      dashboard: jest.fn().mockResolvedValue(dashboard),
      recettesParMois: jest.fn().mockResolvedValue({
        anneeScolaire: { libelle: '2026-2027' },
        parMois: [{ libelle: 'Octobre', montant: 850 }],
        total: 850,
      }),
      salairesParMois: jest.fn().mockResolvedValue({
        anneeScolaire: { libelle: '2026-2027' },
        parMois: [{ libelle: 'Octobre', montant: 300, cumul: 300 }],
      }),
      recouvrementParClasse: jest.fn().mockResolvedValue({
        classes: [{ classe: '5eme A', niveau: '5eme', nbEleves: 10, totalFacture: 1200, totalPaye: 800, totalRestant: 400, taux: 67 }],
      }),
      tresorerieParMois: jest.fn().mockResolvedValue({
        anneeScolaire: { libelle: '2026-2027' },
        mois: [
          { annee: 2026, mois: 10, libelle: 'Octobre' },
          { annee: 2026, mois: 11, libelle: 'Novembre' },
          { annee: 0, mois: 0, libelle: 'Après juin', hors: 'APRES' },
        ],
        encaissements: {
          lignes: [{ libelle: '6eme', origine: 'ELEVES', parMois: [400, 100, 50], total: 550 }],
          parMois: [400, 100, 50],
          total: 550,
        },
        decaissements: {
          lignes: [{ libelle: 'Salaires', origine: 'SALAIRES', parMois: [300, 300, 0], total: 600 }],
          parMois: [300, 300, 0],
          total: 600,
        },
        flux: [100, -200, 50],
        tresorerieInitiale: [0, 100, -100],
        tresorerieFinale: [100, -100, -50],
        benefice: -50,
      }),
    };
    const service = new FinanceExportService(finance as any);

    const buf = await service.bilanXlsx('ecole', 'a1');

    for (const m of Object.values(finance)) expect(m).toHaveBeenCalledWith('ecole', 'a1');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      'Synthèse',
      'Recettes par mois',
      'Salaires par mois',
      'Recouvrement par classe',
      'Trésorerie',
    ]);

    const synthese = wb.getWorksheet('Synthèse')!;
    expect(synthese.getCell('A1').value).toBe('Bilan financier — 2026-2027');
    const lignes = new Map<string, unknown>();
    synthese.eachRow((row) => lignes.set(String(row.getCell(1).value), row.getCell(2).value));
    expect(lignes.get('RÉSULTAT NET')).toBe(-70);
    expect(lignes.get('= Recettes totales')).toBe(850);
    expect(lignes.get('À jour de paiement')).toBe(6);

    const recettes = wb.getWorksheet('Recettes par mois')!;
    expect(recettes.lastRow!.values).toEqual([undefined, 'TOTAL', 850]);

    const rc = wb.getWorksheet('Recouvrement par classe')!;
    expect(rc.getRow(3).values).toEqual([undefined, '5eme A', '5eme', 10, 1200, 800, 400, 67]);

    const tresorerie = wb.getWorksheet('Trésorerie')!;
    const l: unknown[][] = [];
    tresorerie.eachRow((row) => l.push((row.values as unknown[]).slice(1)));
    // la colonne hors période n'a pas d'année : « Après juin », pas « Après juin 0 »
    expect(l[1]).toEqual(['Poste', 'Octobre 2026', 'Novembre 2026', 'Après juin', 'Total']);
    expect(l).toContainEqual(['6eme', 400, 100, 50, 550]);
    expect(l).toContainEqual(['Total encaissements', 400, 100, 50, 550]);
    expect(l).toContainEqual(['Total décaissements', 300, 300, 0, 600]);
    expect(l).toContainEqual(['Flux de trésorerie (E − D)', 100, -200, 50, -50]);
    expect(l).toContainEqual(['Trésorerie initiale', 0, 100, -100]);
    expect(l).toContainEqual(['Trésorerie finale', 100, -100, -50, -50]);
  });
});

describe('FinanceExportService.tresorerieXlsx (téléchargement du tableau de trésorerie)', () => {
  const tresorerie = (libelle = '2026-2027') => ({
    anneeScolaire: { id: 'a1', libelle },
    mois: [
      { annee: 2026, mois: 10, libelle: 'Octobre' },
      { annee: 2026, mois: 11, libelle: 'Novembre' },
    ],
    encaissements: {
      lignes: [{ libelle: '6eme', origine: 'ELEVES', parMois: [1500000, 0], total: 1500000 }],
      parMois: [1500000, 0],
      total: 1500000,
    },
    decaissements: {
      lignes: [
        { libelle: 'Salaires', origine: 'SALAIRES', parMois: [1250000, 0], total: 1250000 },
        { libelle: 'Loyer', origine: 'MOUVEMENT', parMois: [700000, 0], total: 700000 },
      ],
      parMois: [1950000, 0],
      total: 1950000,
    },
    flux: [-450000, 0],
    tresorerieInitiale: [0, -450000],
    tresorerieFinale: [-450000, -450000],
    benefice: -450000,
  });

  async function lireFeuille(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    return wb;
  }

  it('ne contient que la feuille « Trésorerie », comme le tableau affiché à l\'écran', async () => {
    const finance = { tresorerieParMois: jest.fn().mockResolvedValue(tresorerie()) };
    const service = new FinanceExportService(finance as any);

    const { buffer } = await service.tresorerieXlsx('ecole', 'a1');

    expect(finance.tresorerieParMois).toHaveBeenCalledWith('ecole', 'a1');
    const wb = await lireFeuille(buffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Trésorerie']);

    const feuille = wb.getWorksheet('Trésorerie')!;
    expect(feuille.getCell('A1').value).toBe('Trésorerie mensuelle (2026-2027)');
    const l: unknown[][] = [];
    feuille.eachRow((row) => l.push((row.values as unknown[]).slice(1)));
    expect(l[1]).toEqual(['Poste', 'Octobre 2026', 'Novembre 2026', 'Total']);
    expect(l).toContainEqual(['Salaires', 1250000, 0, 1250000]);
    expect(l).toContainEqual(['Loyer', 700000, 0, 700000]);
    expect(l).toContainEqual(['Total décaissements', 1950000, 0, 1950000]);
    expect(l).toContainEqual(['Flux de trésorerie (E − D)', -450000, 0, -450000]);
    expect(l).toContainEqual(['Trésorerie finale', -450000, -450000, -450000]);
  });

  it('formate les montants (séparateur de milliers, négatifs en rouge) et fige poste et mois', async () => {
    const service = new FinanceExportService({ tresorerieParMois: jest.fn().mockResolvedValue(tresorerie()) } as any);
    const wb = await lireFeuille((await service.tresorerieXlsx('ecole', undefined)).buffer);
    const feuille = wb.getWorksheet('Trésorerie')!;

    let cellule: ExcelJS.Cell | undefined;
    feuille.eachRow((row) => {
      if (row.getCell(1).value === 'Loyer') cellule = row.getCell(2);
    });
    expect(cellule?.value).toBe(700000);
    expect(cellule?.numFmt).toContain('#,##0');
    expect(cellule?.numFmt).toContain('[Red]');
    expect(feuille.views[0]).toMatchObject({ state: 'frozen', xSplit: 1, ySplit: 2 });
  });

  it("nomme le fichier d'après l'année scolaire, sans caractère risqué", async () => {
    const service = new FinanceExportService({ tresorerieParMois: jest.fn().mockResolvedValue(tresorerie('2026-2027')) } as any);
    expect((await service.tresorerieXlsx('ecole', undefined)).nomFichier).toBe('tresorerie-mensuelle-2026-2027.xlsx');

    const risque = new FinanceExportService({ tresorerieParMois: jest.fn().mockResolvedValue(tresorerie('2028/2029 "x"\r\n')) } as any);
    expect((await risque.tresorerieXlsx('ecole', undefined)).nomFichier).toBe('tresorerie-mensuelle-2028-2029-x-.xlsx');
  });
});

describe('FinanceExportService.bordereauJournalierXlsx (bordereau journalier en Excel)', () => {
  const ligne = (over: Record<string, unknown> = {}) => ({
    numeroRecu: 'cmtha0tsx000g80imhart8hw3',
    numeroFacture: 'cmtha0tsx000f80imfacture01',
    eleveId: 'e1',
    matricule: '383CR021',
    nomComplet: 'Djiné KANTE',
    classe: 'PSM',
    niveau: 'PSM',
    typeOperation: 'Trimestre 1',
    fraisEtudes: 3600000,
    totalPaye: 3600000,
    date: '2026-10-08',
    observation: 'Espèces',
    ...over,
  });
  const bordereau = (lignes: any[], totaux: Record<string, number>) => ({
    date: '2026-10-08',
    ecole: { nom: 'Les Ecoles Mamé-TA', ville: 'Conakry' },
    filtres: { niveaux: [{ id: 'n1', nom: 'Petite Section' }, { id: 'n2', nom: '6eme' }] },
    lignes,
    totaux: { fraisEtudes: 0, totalPaye: 0, ...totaux },
  });

  async function lire(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const feuille = wb.worksheets[0];
    const lignes: unknown[][] = [];
    feuille.eachRow((row) => lignes.push((row.values as unknown[]).slice(1)));
    return { feuille, lignes };
  }

  it('reproduit la feuille papier : en-tête, une ligne par reçu, totaux, ville et date, signatures', async () => {
    const finance = {
      bordereauJournalier: jest.fn().mockResolvedValue(
        bordereau(
          [
            ligne(),
            ligne({ numeroRecu: 'rec-2', numeroFacture: 'fac-2', eleveId: 'e2', matricule: '498MS022', nomComplet: 'Kadiatou BAH', classe: 'MSM', typeOperation: 'Inscription', fraisEtudes: 0, totalPaye: 150000, observation: 'Virement' }),
          ],
          { fraisEtudes: 3600000, totalPaye: 3750000 },
        ),
      ),
    };
    const service = new FinanceExportService(finance as any);

    const { buffer, nomFichier } = await service.bordereauJournalierXlsx('ecole', { date: '2026-10-08' });

    expect(finance.bordereauJournalier).toHaveBeenCalledWith('ecole', { date: '2026-10-08' });
    expect(nomFichier).toBe('bordereau-journalier-2026-10-08.xlsx');

    const { feuille, lignes } = await lire(buffer);
    expect(feuille.name).toBe('Bordereau journalier');
    expect(lignes[0][0]).toBe('Les Ecoles Mamé-TA');
    expect(feuille.getCell('A4').value).toBe('BORDEREAU JOURNALIER');
    expect(lignes.find((l) => String(l[0]).startsWith('Date :'))?.[0]).toBe('Date : 08/10/2026');

    // plus de colonnes « frais d'inscription » ni « type d'inscription » : un « type d'opération » à la place
    const entete = lignes.find((l) => l[0] === 'N°')!;
    expect(entete).toEqual([
      'N°', 'Classe', 'Reçu N°', 'Facture N°', 'Matricule', 'Prénoms & Nom',
      "Type d'opération", 'Jour du versement', "Frais d'études payés", 'Total payé', 'Observation',
    ]);
    expect(entete).not.toContain("Frais d'inscription");
    expect(entete).not.toContain("Type d'inscription");

    expect(lignes).toContainEqual([1, 'PSM', 'cmtha0tsx000g80imhart8hw3', 'cmtha0tsx000f80imfacture01', '383CR021', 'Djiné KANTE', 'Trimestre 1', '08/10/2026', 3600000, 3600000, 'Espèces']);
    // une inscription n'a pas de frais d'études : cellule vide, mais un total payé
    expect(lignes).toContainEqual([2, 'MSM', 'rec-2', 'fac-2', '498MS022', 'Kadiatou BAH', 'Inscription', '08/10/2026', '', 150000, 'Virement']);
    expect(lignes).toContainEqual(['', '', '', '', '', 'Totaux', '', '', 3600000, 3750000, '']);
    expect(lignes.find((l) => l[0] === 'Conakry, le 08/10/2026')).toBeDefined();
    expect(lignes.find((l) => l[0] === 'Directeur Général')).toContain('Percepteur-Comptable');
  });

  it('indique le niveau filtré dans le titre et dans le nom du fichier', async () => {
    const finance = { bordereauJournalier: jest.fn().mockResolvedValue(bordereau([], {})) };
    const service = new FinanceExportService(finance as any);

    const { buffer, nomFichier } = await service.bordereauJournalierXlsx('ecole', { date: '2026-10-08', niveauId: 'n1' });

    expect(nomFichier).toBe('bordereau-journalier-2026-10-08-Petite-Section.xlsx');
    const { lignes } = await lire(buffer);
    expect(lignes.find((l) => String(l[0]).startsWith('Date :'))?.[0]).toBe('Date : 08/10/2026  ·  Niveau : Petite Section');
  });

  it('formate les montants avec séparateur de milliers', async () => {
    const service = new FinanceExportService({
      bordereauJournalier: jest.fn().mockResolvedValue(bordereau([ligne()], { fraisEtudes: 3600000, totalPaye: 3600000 })),
    } as any);
    const { feuille } = await lire((await service.bordereauJournalierXlsx('ecole', {})).buffer);
    expect(feuille.getCell('I8').numFmt).toBe('#,##0');
    expect(feuille.getCell('I8').value).toBe(3600000);
    expect(feuille.getCell('J8').numFmt).toBe('#,##0');
  });
});

describe('SmsSimuleService', () => {
  it("simule l'envoi et signale toujours un succès", async () => {
    const journal = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    await expect(new SmsSimuleService().envoyer('620000000', 'test')).resolves.toBe(true);
    expect(journal).toHaveBeenCalled();
    journal.mockRestore();
  });
});
