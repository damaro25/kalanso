import { Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { FinanceService } from './finance.service';

@Injectable()
export class FinanceExportService {
  constructor(private finance: FinanceService) {}

  async bilanXlsx(ecoleId: string, anneeScolaireId: string | undefined): Promise<Buffer> {
    const [dashboard, recettes, salaires, recouvrement] = await Promise.all([
      this.finance.dashboard(ecoleId, anneeScolaireId),
      this.finance.recettesParMois(ecoleId, anneeScolaireId),
      this.finance.salairesParMois(ecoleId, anneeScolaireId),
      this.finance.recouvrementParClasse(ecoleId, anneeScolaireId),
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

    return wb.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
