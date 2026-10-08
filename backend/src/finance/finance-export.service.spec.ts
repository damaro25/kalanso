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
    };
    const service = new FinanceExportService(finance as any);

    const buf = await service.bilanXlsx('ecole', 'a1');

    for (const m of Object.values(finance)) expect(m).toHaveBeenCalledWith('ecole', 'a1');

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as any);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Synthèse', 'Recettes par mois', 'Salaires par mois', 'Recouvrement par classe']);

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
