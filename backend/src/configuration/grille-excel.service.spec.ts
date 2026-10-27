import * as ExcelJS from 'exceljs';
import { GrilleExcelService, lireEcheance, lireMontant } from './grille-excel.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

const GRILLE = {
  anneeScolaireId: 'a1',
  echeances: ['2026-10-31', '2027-01-31', null],
  niveaux: [
    {
      niveauId: 'n1',
      nom: '1ère Année',
      cycle: 'Primaire',
      fraisInscription: 100000,
      fraisReinscription: null,
      tarifs: { INTERNAT: [3500000, 2500000, 500000] },
    },
    { niveauId: 'n2', nom: '2ème Année', cycle: 'Primaire', fraisInscription: null, fraisReinscription: null, tarifs: {} },
  ],
};

async function modifier(buffer: Buffer, modif: (wb: ExcelJS.Workbook) => void) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  modif(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const colonne = (ws: ExcelJS.Worksheet, titre: string) => {
  let n = 0;
  ws.getRow(1).eachCell((c, i) => {
    if (c.value === titre) n = i;
  });
  return n;
};

describe('GrilleExcelService', () => {
  let prisma: any;
  let configuration: { grille: jest.Mock; enregistrerGrille: jest.Mock };
  let service: GrilleExcelService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    configuration = {
      grille: jest.fn().mockResolvedValue(structuredClone(GRILLE)),
      enregistrerGrille: jest.fn().mockResolvedValue({}),
    };
    service = new GrilleExcelService(prisma, configuration as any);
  });

  it('lit montants et échéances usuels', () => {
    expect([lireMontant(1500000), lireMontant('1 500 000 GNF'), lireMontant(''), lireMontant(0), lireMontant('abc')]).toEqual([
      1500000,
      1500000,
      null,
      null,
      'invalide',
    ]);
    expect([lireEcheance('31/10/2026'), lireEcheance('2027-01-31'), lireEcheance('31/02/2027'), lireEcheance('')]).toEqual([
      '2026-10-31',
      '2027-01-31',
      'invalide',
      null,
    ]);
  });

  it("un export réimporté tel quel ne change rien", async () => {
    const { buffer, nomFichier } = await service.exporter('ecole', 'a1');
    expect(nomFichier).toBe('grille-tarifaire-2026-2027.xlsx');
    const r = await service.apercu('ecole', 'a1', buffer);
    expect(r.lignes.map((l) => l.action)).toEqual(['INCHANGE', 'INCHANGE']);
    expect(r.echeances).toEqual({ changements: [], erreurs: [] });
    expect(r).toMatchObject({ aModifier: 0, enErreur: 0, niveauxAbsents: [] });
  });

  it("détaille les changements puis enregistre la grille complète (niveaux absents inchangés)", async () => {
    const { buffer } = await service.exporter('ecole', 'a1');
    const modifie = await modifier(buffer, (wb) => {
      const ws = wb.getWorksheet('Grille')!;
      ws.getRow(2).getCell(colonne(ws, 'Internat - Tranche 1')).value = 4000000;
      ws.getRow(2).getCell(colonne(ws, 'Externat - Tranche 1')).value = '1 200 000';
      ws.spliceRows(3, 1); // 2ème Année retirée du fichier
      wb.getWorksheet('Échéances')!.getRow(4).getCell(2).value = '30/04/2027';
    });

    const r = await service.apercu('ecole', 'a1', modifie);
    expect(r.lignes).toEqual([
      expect.objectContaining({
        niveau: '1ère Année',
        action: 'MODIFIE',
        changements: ['Externat - Tranche 1 : vide → 1 200 000 GNF', 'Internat - Tranche 1 : 3 500 000 GNF → 4 000 000 GNF'],
      }),
    ]);
    expect(r.niveauxAbsents).toEqual(['2ème Année']);
    expect(r.echeances.changements).toEqual(['Échéance tranche 3 : aucune → 30/04/2027']);

    await service.importer('ecole', 'a1', modifie);
    const dto = configuration.enregistrerGrille.mock.calls[0][2];
    expect(dto.echeances).toEqual(['2026-10-31', '2027-01-31', '2027-04-30']);
    expect(dto.niveaux.find((n: any) => n.niveauId === 'n1')).toMatchObject({
      fraisInscription: 100000,
      tarifs: { INTERNAT: [4000000, 2500000, 500000], EXTERNAT: [1200000, null, null] },
    });
    expect(dto.niveaux.find((n: any) => n.niveauId === 'n2')).toMatchObject({ fraisInscription: null, tarifs: {} });
  });

  it('crée à l’import les niveaux inconnus et leur applique la grille', async () => {
    const { buffer } = await service.exporter('ecole', 'a1');
    const modifie = await modifier(buffer, (wb) => {
      const ws = wb.getWorksheet('Grille')!;
      const r = ws.addRow(['CM2', 'Primaire']);
      r.getCell(colonne(ws, "Frais d'inscription")).value = 150000;
    });
    const r = await service.apercu('ecole', 'a1', modifie);
    expect(r.niveauxACreer).toEqual(['CM2']);
    expect(r.lignes.find((l) => l.niveau === 'CM2')).toMatchObject({ action: 'CREE', erreurs: [] });

    prisma.niveau.findMany.mockResolvedValue([{ ordre: 1 }, { ordre: 2 }]);
    prisma.niveau.create.mockResolvedValue({ id: 'n3' });
    const res = await service.importer('ecole', 'a1', modifie);
    expect(prisma.niveau.create).toHaveBeenCalledWith({ data: { ecoleId: 'ecole', nom: 'CM2', cycle: 'Primaire', ordre: 3 } });
    expect(res.niveauxCrees).toEqual(['CM2']);
    const dto = configuration.enregistrerGrille.mock.calls[0][2];
    expect(dto.niveaux.find((n: any) => n.niveauId === 'n3')).toMatchObject({ fraisInscription: 150000 });
  });

  it("refuse d'importer un fichier avec des erreurs (montant illisible)", async () => {
    const { buffer } = await service.exporter('ecole', 'a1');
    const modifie = await modifier(buffer, (wb) => {
      const ws = wb.getWorksheet('Grille')!;
      ws.getRow(2).getCell(colonne(ws, "Frais d'inscription")).value = 'cent mille';
    });
    const r = await service.apercu('ecole', 'a1', modifie);
    expect(r.enErreur).toBe(1);
    expect(prisma.niveau.create).not.toHaveBeenCalled();
    await expect(service.importer('ecole', 'a1', modifie)).rejects.toThrow('erreurs');
    expect(configuration.enregistrerGrille).not.toHaveBeenCalled();
  });
});
