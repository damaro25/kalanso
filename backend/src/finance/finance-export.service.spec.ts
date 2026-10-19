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
    paiementIds: ['cmtha0tsx000g80imhart8hw3'],
    numerosRecu: ['001480'],
    eleveId: 'e1',
    matricule: '383CR021',
    nomComplet: 'Djiné KANTE',
    classe: 'PSM',
    niveau: 'PSM',
    fraisInscription: 0,
    typeInscription: '',
    assurance: 0,
    totalInscriptionAssurance: 0,
    fraisEtudes: 3600000,
    fraisFormations: 0,
    totalPaye: 3600000,
    date: '2026-10-08',
    observation: 'Espèces',
    ...over,
  });
  const TOTAUX_NULS = { fraisInscription: 0, assurance: 0, totalInscriptionAssurance: 0, fraisEtudes: 0, fraisFormations: 0, totalPaye: 0 };
  const bordereau = (lignes: any[], totaux: Record<string, number>) => ({
    date: '2026-10-08',
    ecole: { nom: 'Les Ecoles Mamé-TA', sigle: 'MTA', ville: 'Conakry', nomDirecteur: 'Mamadou DIALLO', nomComptable: 'Aïssata SOW' },
    filtres: { niveaux: [{ id: 'n1', nom: 'Petite Section' }, { id: 'n2', nom: '6eme' }] },
    lignes,
    totaux: { ...TOTAUX_NULS, ...totaux },
  });

  async function lire(buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const feuille = wb.worksheets[0];
    const valeurs = (r: number) => Array.from({ length: 14 }, (_, i) => feuille.getCell(r, i + 1).value ?? '');
    return { feuille, valeurs };
  }

  it('reproduit la feuille papier : en-tête, une ligne par élève, totaux encadrés, ville et date, signatures', async () => {
    const finance = {
      bordereauJournalier: jest.fn().mockResolvedValue(
        bordereau(
          [
            ligne(),
            ligne({
              paiementIds: ['rec-2', 'rec-3'], numerosRecu: ['001481', '001482'], eleveId: 'e2', matricule: '498MS022',
              nomComplet: 'Kadiatou BAH', classe: 'MSM', fraisInscription: 150000, typeInscription: 'Inscription',
              assurance: 25000, totalInscriptionAssurance: 175000, fraisEtudes: 0, fraisFormations: 25000, totalPaye: 200000, observation: 'Virement, Espèces',
            }),
          ],
          { fraisInscription: 150000, assurance: 25000, totalInscriptionAssurance: 175000, fraisEtudes: 3600000, fraisFormations: 25000, totalPaye: 3800000 },
        ),
      ),
    };
    const service = new FinanceExportService(finance as any);

    const { buffer, nomFichier } = await service.bordereauJournalierXlsx('ecole', { date: '2026-10-08' });

    expect(finance.bordereauJournalier).toHaveBeenCalledWith('ecole', { date: '2026-10-08' });
    expect(nomFichier).toBe('bordereau-journalier-2026-10-08.xlsx');

    const { feuille, valeurs } = await lire(buffer);
    expect(feuille.name).toBe('Bordereau journalier');
    expect(feuille.pageSetup.orientation).toBe('landscape');

    // en-tête
    expect(feuille.getCell('A1').value).toBe('LES ECOLES MAMÉ-TA');
    expect(feuille.getCell('A1').font.color?.argb).toBe('FF2E75B6');
    expect(feuille.getCell('L1').value).toBe('REPUBLIQUE DE GUINEE');
    expect(feuille.getCell('L2').value).toBe('Travail-Justice-Solidarité');
    expect(feuille.getCell('M3').value).toBe(3800000); // total du jour sur fond jaune
    expect((feuille.getCell('M3').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFFFFF00');
    expect(feuille.getCell('A5').value).toBe('BORDEREAU JOURNALIER');

    expect(valeurs(7)).toEqual([
      'N°', 'Classe', 'Reçu', 'Matricule', 'Prénoms & Nom', 'Frais inscription', 'Type inscription', 'T-shirt',
      'Total frais insc + Ass', 'Jour versement', 'Frais études payés', 'Formations', 'Total payé', 'Observation',
    ]);
    expect((feuille.getCell('A7').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FF2E75B6');

    // montants nuls : cases vides ; plusieurs reçus du même élève l'un sous l'autre
    expect(valeurs(8)).toEqual([1, 'PSM', '001480', '383CR021', 'Djiné KANTE', '', '', '', '', '08/10/2026', 3600000, '', 3600000, 'Espèces']);
    expect(valeurs(9)).toEqual([
      2, 'MSM', '001481\n001482', '498MS022', 'Kadiatou BAH', 150000, 'Inscription', 25000, 175000, '08/10/2026', '', 25000, 200000, 'Virement, Espèces',
    ]);
    expect((feuille.getCell('A9').fill as ExcelJS.FillPattern).fgColor?.argb).toBe('FFDDEBF7'); // une ligne sur deux

    expect(valeurs(10)).toEqual(['', '', '', '', 'Totaux', 150000, '', 25000, 175000, '', 3600000, 25000, 3800000, '']);
    expect(feuille.getCell('M10').border.top?.style).toBe('thin');

    expect(feuille.getCell('L12').value).toBe('Conakry, le 08/10/2026');
    expect(feuille.getCell('B14').value).toBe('Directeur Général');
    expect(feuille.getCell('K14').value).toBe('Percepteur-Comptable');
    expect(feuille.getCell('B17').value).toBe('Mamadou DIALLO');
    expect(feuille.getCell('K17').value).toBe('Aïssata SOW');
  });

  it('indique le niveau filtré sous le titre et dans le nom du fichier', async () => {
    const finance = { bordereauJournalier: jest.fn().mockResolvedValue(bordereau([], {})) };
    const service = new FinanceExportService(finance as any);

    const { buffer, nomFichier } = await service.bordereauJournalierXlsx('ecole', { date: '2026-10-08', niveauId: 'n1' });

    expect(nomFichier).toBe('bordereau-journalier-2026-10-08-Petite-Section.xlsx');
    const { feuille } = await lire(buffer);
    expect(feuille.getCell('A6').value).toBe('Niveau : Petite Section');
  });

  it("sans ville ni signataires : « Le JJ/MM/AAAA » et noms vides", async () => {
    const b = bordereau([], {});
    b.ecole = { ...b.ecole, ville: null as any, nomDirecteur: null as any, nomComptable: null as any };
    const service = new FinanceExportService({ bordereauJournalier: jest.fn().mockResolvedValue(b) } as any);
    const { feuille } = await lire((await service.bordereauJournalierXlsx('ecole', {})).buffer);
    expect(feuille.getCell('L10').value).toBe('Le 08/10/2026');
    expect(feuille.getCell('B15').value ?? '').toBe('');
  });

  it('formate les montants avec séparateur de milliers', async () => {
    const service = new FinanceExportService({
      bordereauJournalier: jest.fn().mockResolvedValue(bordereau([ligne()], { fraisEtudes: 3600000, totalPaye: 3600000 })),
    } as any);
    const { feuille } = await lire((await service.bordereauJournalierXlsx('ecole', {})).buffer);
    expect(feuille.getCell('K8').numFmt).toBe('#,##0');
    expect(feuille.getCell('K8').value).toBe(3600000);
    expect(feuille.getCell('M8').numFmt).toBe('#,##0');
    expect(feuille.getCell('M3').numFmt).toBe('#,##0');
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
