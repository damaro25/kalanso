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

  // Bordereau journalier au format de la feuille papier de l'école : une ligne par reçu (paiement),
  // avec son N° de reçu, le N° de la facture réglée et le type d'opération ; totaux en bas, ville et
  // date, puis les signatures.
  async bordereauJournalierXlsx(
    ecoleId: string,
    filtres: { date?: string; niveauId?: string },
  ): Promise<{ buffer: Buffer; nomFichier: string }> {
    const b = await this.finance.bordereauJournalier(ecoleId, filtres);
    const niveau = filtres.niveauId ? b.filtres.niveaux.find((n) => n.id === filtres.niveauId) : undefined;
    const dateFr = b.date.split('-').reverse().join('/');

    const colonnes: { titre: string; largeur: number; montant?: boolean }[] = [
      { titre: 'N°', largeur: 6 },
      { titre: 'Classe', largeur: 12 },
      { titre: 'Reçu N°', largeur: 30 },
      { titre: 'Facture N°', largeur: 30 },
      { titre: 'Matricule', largeur: 14 },
      { titre: 'Prénoms & Nom', largeur: 30 },
      { titre: "Type d'opération", largeur: 18 },
      { titre: 'Jour du versement', largeur: 16 },
      { titre: "Frais d'études payés", largeur: 18, montant: true },
      { titre: 'Total payé', largeur: 16, montant: true },
      { titre: 'Observation', largeur: 20 },
    ];
    const nbCol = colonnes.length;

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Bordereau journalier');
    colonnes.forEach((c, i) => (ws.getColumn(i + 1).width = c.largeur));

    ws.addRow([b.ecole.nom]).font = { bold: true, size: 14 };
    ws.addRow(['République de Guinée — Travail, Justice, Solidarité']).font = { italic: true };
    ws.addRow([]);
    ws.mergeCells(4, 1, 4, nbCol);
    ws.getCell(4, 1).value = 'BORDEREAU JOURNALIER';
    ws.getCell(4, 1).font = { bold: true, size: 14 };
    ws.getCell(4, 1).alignment = { horizontal: 'center' };
    ws.addRow([`Date : ${dateFr}${niveau ? `  ·  Niveau : ${niveau.nom}` : ''}`]).font = { bold: true };
    ws.addRow([]);

    const entete = ws.addRow(colonnes.map((c) => c.titre));
    entete.font = { bold: true };
    entete.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    entete.height = 32;

    b.lignes.forEach((l, i) => {
      const row = ws.addRow([
        i + 1,
        l.classe,
        l.numeroRecu,
        l.numeroFacture,
        l.matricule ?? '',
        l.nomComplet,
        l.typeOperation,
        dateFr,
        l.fraisEtudes > 0 ? l.fraisEtudes : '', // frais d'études seulement pour l'écolage et les trimestres
        l.totalPaye,
        l.observation,
      ]);
      row.alignment = { vertical: 'top', wrapText: true };
    });

    // Ligne des totaux, sous les colonnes de montants
    const totaux = ws.addRow(
      colonnes.map((c) => {
        if (c.titre === 'Prénoms & Nom') return 'Totaux';
        if (c.titre === "Frais d'études payés") return b.totaux.fraisEtudes;
        if (c.titre === 'Total payé') return b.totaux.totalPaye;
        return '';
      }),
    );
    totaux.font = { bold: true };

    // Montants avec séparateur de milliers (les lignes de données commencent en 8)
    colonnes.forEach((c, i) => {
      if (!c.montant) return;
      for (let r = 8; r <= totaux.number; r++) {
        const cell = ws.getCell(r, i + 1);
        if (typeof cell.value === 'number') cell.numFmt = '#,##0';
      }
    });

    ws.addRow([]);
    ws.addRow([`${b.ecole.ville ? `${b.ecole.ville}, le` : 'Le'} ${dateFr}`]);
    ws.addRow([]);
    const signatures = ws.addRow(colonnes.map((_, i) => (i === 0 ? 'Directeur Général' : i === nbCol - 2 ? 'Percepteur-Comptable' : '')));
    signatures.font = { bold: true };

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
