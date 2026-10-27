import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { FinanceService } from './finance.service';

@Injectable()
export class FinanceExportService {
  constructor(private finance: FinanceService) {}

  async bilanXlsx(ecoleId: string, anneeScolaireId: string | undefined): Promise<Buffer> {
    const [dashboard, recettes, salaires, recouvrement, tresorerie] = await Promise.all([
      this.finance.dashboard(ecoleId, anneeScolaireId),
      this.finance.recettesParMois(ecoleId, anneeScolaireId),
      this.finance.salairesParMois(ecoleId, anneeScolaireId),
      this.finance.recouvrementParClasse(ecoleId, anneeScolaireId),
      this.finance.tresorerieParMois(ecoleId, anneeScolaireId),
    ]);

    const wb = new ExcelJS.Workbook();

    // --- Synthèse ---
    const s = wb.addWorksheet('Synthèse');
    s.getColumn(1).width = 36;
    s.getColumn(2).width = 20;
    s.mergeCells('A1:B1');
    s.getCell('A1').value = `Bilan financier — ${dashboard.anneeScolaire.libelle}`;
    s.getCell('A1').font = { bold: true, size: 14 };

    const ligne = (label: string, valeur: string | number, gras = false) => {
      const row = s.addRow([label, valeur]);
      if (gras) row.font = { bold: true };
    };
    s.addRow([]);
    ligne('ÉCOLAGE', '', true);
    ligne('Total facturé', dashboard.ecolage.totalFacture);
    ligne('Total encaissé', dashboard.ecolage.totalEncaisse);
    ligne('Reste à payer', dashboard.ecolage.totalRestant, true);
    ligne('Taux de recouvrement (%)', dashboard.ecolage.tauxRecouvrement);
    s.addRow([]);
    ligne('INSCRIPTION', '', true);
    ligne('Total facturé', dashboard.inscription.totalFacture);
    ligne('Total encaissé', dashboard.inscription.totalEncaisse);
    ligne('Reste à payer', dashboard.inscription.totalRestant, true);
    ligne('Taux de recouvrement (%)', dashboard.inscription.tauxRecouvrement);
    s.addRow([]);
    ligne('ÉLÈVES', '', true);
    ligne('Inscrits', dashboard.eleves.nbInscrits);
    ligne('À jour de paiement', dashboard.eleves.nbAJour);
    ligne('En retard de paiement', dashboard.eleves.nbEnRetard);
    ligne('Sans facture', dashboard.eleves.nbSansFacture);
    s.addRow([]);
    ligne('SALAIRES', '', true);
    ligne(`Masse salariale (${dashboard.moisCourant})`, dashboard.salaires.masseSalarialeMois);
    ligne(`Masse salariale cumulée (${dashboard.anneeScolaire.libelle})`, dashboard.salaires.masseSalarialeCumul);
    s.addRow([]);
    ligne(`COMPTE DE RÉSULTAT (${dashboard.anneeScolaire.libelle})`, '', true);
    ligne('Écolage encaissé', dashboard.compteResultat.ecolageEncaisse);
    ligne('Inscription encaissée', dashboard.compteResultat.inscriptionEncaisse);
    ligne('Autres recettes', dashboard.compteResultat.autresRecettes);
    ligne('= Recettes totales', dashboard.compteResultat.recettesTotales, true);
    ligne('Salaires', dashboard.compteResultat.depensesSalaires);
    ligne('Autres dépenses', dashboard.compteResultat.depensesAutres);
    ligne('= Dépenses totales', dashboard.compteResultat.depensesTotales, true);
    ligne('RÉSULTAT NET', dashboard.compteResultat.resultatNet, true);

    // --- Recettes par mois ---
    const r = wb.addWorksheet('Recettes par mois');
    r.addRow([`Recettes encaissées — ${recettes.anneeScolaire.libelle}`]).font = { bold: true, size: 12 };
    r.addRow(['Mois', 'Montant (GNF)']).font = { bold: true };
    r.getColumn(1).width = 16;
    r.getColumn(2).width = 18;
    for (const m of recettes.parMois) r.addRow([m.libelle, m.montant]);
    r.addRow(['TOTAL', recettes.total]).font = { bold: true };

    // --- Salaires par mois ---
    const sal = wb.addWorksheet('Salaires par mois');
    sal.addRow([`Masse salariale — ${salaires.anneeScolaire.libelle}`]).font = { bold: true, size: 12 };
    sal.addRow(['Mois', 'Montant (GNF)', 'Cumul (GNF)']).font = { bold: true };
    sal.getColumn(1).width = 16;
    sal.getColumn(2).width = 18;
    sal.getColumn(3).width = 18;
    for (const m of salaires.parMois) sal.addRow([m.libelle, m.montant, m.cumul]);

    // --- Recouvrement par classe ---
    const rc = wb.addWorksheet('Recouvrement par classe');
    rc.addRow(['Recouvrement par classe']).font = { bold: true, size: 12 };
    rc.addRow(['Classe', 'Niveau', 'Élèves', 'Facturé', 'Encaissé', 'Reste', 'Taux %']).font = { bold: true };
    [22, 14, 10, 16, 16, 16, 10].forEach((w, i) => (rc.getColumn(i + 1).width = w));
    for (const c of recouvrement.classes) {
      rc.addRow([c.classe, c.niveau, c.nbEleves, c.totalFacture, c.totalPaye, c.totalRestant, c.taux]);
    }

    this.ajouterFeuilleTresorerie(wb, tresorerie);

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  // Export du seul tableau « Trésorerie mensuelle » (celui de la page Bilan financier).
  async tresorerieXlsx(ecoleId: string, anneeScolaireId: string | undefined): Promise<{ buffer: Buffer; nomFichier: string }> {
    const tresorerie = await this.finance.tresorerieParMois(ecoleId, anneeScolaireId);
    const wb = new ExcelJS.Workbook();
    this.ajouterFeuilleTresorerie(wb, tresorerie);

    const libelle = tresorerie.anneeScolaire.libelle.replace(/[^A-Za-z0-9-]+/g, '-');
    return {
      buffer: (await wb.xlsx.writeBuffer()) as unknown as Buffer,
      nomFichier: `tresorerie-mensuelle-${libelle}.xlsx`,
    };
  }

  // Bordereau journalier, copie de la feuille papier de l'école : en-tête (école, République, total du
  // jour sur fond jaune), tableau à en-tête bleu et lignes alternées, totaux encadrés, ville et date,
  // puis les signatures du Directeur Général et du Percepteur-Comptable.
  async bordereauJournalierXlsx(
    ecoleId: string,
    filtres: { date?: string; niveauId?: string },
  ): Promise<{ buffer: Buffer; nomFichier: string }> {
    const b = await this.finance.bordereauJournalier(ecoleId, filtres);
    const niveau = filtres.niveauId ? b.filtres.niveaux.find((n) => n.id === filtres.niveauId) : undefined;
    const dateFr = b.date.split('-').reverse().join('/');

    const BLEU = 'FF2E75B6';
    const BLEU_CLAIR = 'FFDDEBF7';
    const fin: Partial<ExcelJS.Border> = { style: 'thin' };
    const bordures: Partial<ExcelJS.Borders> = { top: fin, left: fin, bottom: fin, right: fin };
    const montant = '#,##0';

    const colonnes = [
      'N°', 'Classe', 'Reçu', 'Matricule', 'Prénoms & Nom', 'Frais inscription', 'Type inscription', 'T-shirt',
      'Total frais insc + Ass', 'Jour versement', 'Frais études payés', 'Formations', 'Total payé', 'Observation',
    ];
    const largeurs = [5, 10, 10, 12, 28, 12, 13, 11, 13, 12, 13, 12, 13, 16];
    const colonnesMontant = [6, 8, 9, 11, 12, 13]; // F, H, I, K, L, M
    const nbCol = colonnes.length;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bordereau journalier', {
      pageSetup: { orientation: 'landscape', paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    largeurs.forEach((l, i) => (ws.getColumn(i + 1).width = l));

    // En-tête : école à gauche, République et total du jour à droite
    ws.mergeCells('A1:E2');
    ws.getCell('A1').value = b.ecole.nom.toUpperCase();
    ws.getCell('A1').font = { bold: true, size: 16, color: { argb: BLEU } };
    ws.getCell('A1').alignment = { vertical: 'middle' };
    ws.mergeCells('L1:N1');
    ws.getCell('L1').value = 'REPUBLIQUE DE GUINEE';
    ws.getCell('L1').font = { bold: true };
    ws.getCell('L1').alignment = { horizontal: 'center' };
    ws.mergeCells('L2:N2');
    ws.getCell('L2').value = 'Travail-Justice-Solidarité';
    ws.getCell('L2').font = { italic: true };
    ws.getCell('L2').alignment = { horizontal: 'center' };
    const totalJour = ws.getCell('M3');
    totalJour.value = b.totaux.totalPaye;
    totalJour.numFmt = montant;
    totalJour.font = { bold: true };
    totalJour.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFFF00' } };
    totalJour.border = bordures;

    ws.mergeCells('A5:N5');
    ws.getCell('A5').value = 'BORDEREAU JOURNALIER';
    ws.getCell('A5').font = { bold: true, size: 14 };
    ws.getCell('A5').alignment = { horizontal: 'center' };
    if (niveau) {
      ws.mergeCells('A6:N6');
      ws.getCell('A6').value = `Niveau : ${niveau.nom}`;
      ws.getCell('A6').font = { bold: true };
      ws.getCell('A6').alignment = { horizontal: 'center' };
    }

    // Tableau (en-têtes en ligne 7, données dès la ligne 8)
    const entete = ws.getRow(7);
    entete.values = colonnes;
    entete.height = 32;
    for (let c = 1; c <= nbCol; c++) {
      const cell = entete.getCell(c);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU } };
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = bordures;
    }

    b.lignes.forEach((l, i) => {
      const row = ws.getRow(8 + i);
      row.values = [
        i + 1,
        l.classe,
        l.numerosRecu.join('\n'),
        l.matricule ?? '',
        l.nomComplet,
        l.fraisInscription || '',
        l.typeInscription,
        l.assurance || '',
        l.totalInscriptionAssurance || '',
        dateFr,
        l.fraisEtudes || '',
        l.fraisFormations || '',
        l.totalPaye,
        l.observation,
      ];
      for (let c = 1; c <= nbCol; c++) {
        const cell = row.getCell(c);
        cell.border = bordures;
        const estMontant = colonnesMontant.includes(c);
        cell.alignment = {
          vertical: 'top',
          wrapText: true,
          horizontal: estMontant ? 'right' : c <= 3 ? 'center' : undefined,
        };
        if (estMontant) cell.numFmt = montant;
        if (c <= 2) cell.font = { bold: true };
        if (i % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BLEU_CLAIR } };
      }
    });

    // Totaux, encadrés sous les colonnes de montants
    const ligneTotaux = 8 + b.lignes.length;
    const totaux = ws.getRow(ligneTotaux);
    totaux.getCell(5).value = 'Totaux';
    totaux.getCell(5).alignment = { horizontal: 'right' };
    const valeursTotaux: Record<number, number> = {
      6: b.totaux.fraisInscription,
      8: b.totaux.assurance,
      9: b.totaux.totalInscriptionAssurance,
      11: b.totaux.fraisEtudes,
      12: b.totaux.fraisFormations,
      13: b.totaux.totalPaye,
    };
    for (const [c, v] of Object.entries(valeursTotaux)) {
      const cell = totaux.getCell(Number(c));
      cell.value = v;
      cell.numFmt = montant;
      cell.border = bordures;
      cell.alignment = { horizontal: 'right' };
    }
    totaux.font = { bold: true };

    // Lieu et date, puis signatures
    const ligneDate = ligneTotaux + 2;
    ws.mergeCells(ligneDate, 12, ligneDate, 14);
    const lieu = ws.getCell(ligneDate, 12);
    lieu.value = `${b.ecole.ville ? `${b.ecole.ville}, le` : 'Le'} ${dateFr}`;
    lieu.font = { bold: true, italic: true };
    lieu.alignment = { horizontal: 'right' };

    const ligneSignatures = ligneDate + 2;
    ws.getCell(ligneSignatures, 2).value = 'Directeur Général';
    ws.getCell(ligneSignatures, 11).value = 'Percepteur-Comptable';
    ws.getRow(ligneSignatures).font = { bold: true };
    const ligneNoms = ligneSignatures + 3;
    ws.getCell(ligneNoms, 2).value = b.ecole.nomDirecteur ?? '';
    ws.getCell(ligneNoms, 11).value = b.ecole.nomComptable ?? '';

    const slug = niveau ? `-${niveau.nom.replace(/[^A-Za-z0-9]+/g, '-')}` : '';
    return {
      buffer: (await wb.xlsx.writeBuffer()) as unknown as Buffer,
      nomFichier: `bordereau-journalier-${b.date}${slug}.xlsx`,
    };
  }

  // Feuille « Trésorerie » : encaissements, décaissements, flux, trésorerie initiale/finale, comme à l'écran.
  private ajouterFeuilleTresorerie(wb: ExcelJS.Workbook, tresorerie: Awaited<ReturnType<FinanceService['tresorerieParMois']>>) {
    const t = wb.addWorksheet('Trésorerie');
    t.addRow([`Trésorerie mensuelle (${tresorerie.anneeScolaire.libelle})`]).font = { bold: true, size: 14 };
    t.addRow(['Poste', ...tresorerie.mois.map((m) => (m.hors ? m.libelle : `${m.libelle} ${m.annee}`)), 'Total']).font = { bold: true };
    t.getColumn(1).width = 30;
    for (let i = 0; i <= tresorerie.mois.length; i++) t.getColumn(i + 2).width = 16;
    t.views = [{ state: 'frozen', xSplit: 1, ySplit: 2 }]; // poste et mois restent visibles en défilant

    const section = (titre: string, bloc: { lignes: { libelle: string; parMois: number[]; total: number }[]; parMois: number[]; total: number }) => {
      t.addRow([titre]).font = { bold: true };
      for (const l of bloc.lignes) t.addRow([l.libelle, ...l.parMois, l.total]);
      t.addRow([`Total ${titre.toLowerCase()}`, ...bloc.parMois, bloc.total]).font = { bold: true };
    };
    section('Encaissements', tresorerie.encaissements);
    section('Décaissements', tresorerie.decaissements);
    t.addRow(['Flux de trésorerie (E − D)', ...tresorerie.flux, tresorerie.benefice]).font = { bold: true };
    t.addRow(['Trésorerie initiale', ...tresorerie.tresorerieInitiale]);
    t.addRow(['Trésorerie finale', ...tresorerie.tresorerieFinale, tresorerie.tresorerieFinale[tresorerie.tresorerieFinale.length - 1] ?? 0]).font = { bold: true };
    t.addRow([]);
    t.addRow(['FT = E − D · Ti = trésorerie finale de la colonne précédente (0 pour la première) · Tf = FT + Ti']).font = { italic: true };

    // Montants avec séparateur de milliers, négatifs en rouge.
    t.eachRow((row, numero) => {
      if (numero < 3) return;
      row.eachCell((cell, colonne) => {
        if (colonne > 1 && typeof cell.value === 'number') cell.numFmt = '#,##0;[Red]-#,##0';
      });
    });
  }
}
