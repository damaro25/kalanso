import * as ExcelJS from 'exceljs';
import { EcoleExcelService } from './ecole-excel.service';

const ECOLE = {
  id: 'ecole',
  nom: 'Les Écoles Mamé-TA',
  sigle: null,
  ville: 'Conakry',
  telephone: '622 14 91 07',
  email: 'mametahold016@gmail.com',
  nomDirecteur: null,
  nomComptable: 'M. Bah',
  numeroRecuDepart: 4853,
  carteRetraitMinistere: null,
  carteRetraitDev: null,
  carteRetraitDce: null,
  carteRetraitSignataire: null,
};

async function modifier(buffer: Buffer, valeurs: Record<string, string | number>) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as any);
  const ws = wb.getWorksheet('Coordonnées')!;
  ws.eachRow((row) => {
    const libelle = String(row.getCell(1).value ?? '');
    if (libelle in valeurs) row.getCell(2).value = valeurs[libelle];
  });
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('EcoleExcelService', () => {
  let configuration: { ecole: jest.Mock; updateEcole: jest.Mock };
  let service: EcoleExcelService;

  beforeEach(() => {
    configuration = { ecole: jest.fn().mockResolvedValue({ ...ECOLE }), updateEcole: jest.fn().mockResolvedValue({}) };
    service = new EcoleExcelService(configuration as any);
  });

  it('un export réimporté tel quel ne change rien', async () => {
    const r = await service.apercu('ecole', await service.exporter('ecole'));
    expect(r).toEqual({ changements: [], erreurs: [], champsIgnores: [] });
  });

  it('détaille les changements puis enregistre', async () => {
    const fichier = await modifier(await service.exporter('ecole'), { 'Directeur Général': 'Mme Camara', 'Numéroter les reçus à partir de': 5000 });
    const r = await service.apercu('ecole', fichier);
    expect(r.changements).toEqual([
      { champ: 'Directeur Général', avant: '', apres: 'Mme Camara' },
      { champ: 'Numéroter les reçus à partir de', avant: '4853', apres: '5000' },
    ]);
    await service.importer('ecole', fichier);
    expect(configuration.updateEcole.mock.calls[0][1]).toMatchObject({ nomDirecteur: 'Mme Camara', numeroRecuDepart: 5000, nom: 'Les Écoles Mamé-TA' });
  });

  it("refuse un nom vide, un email ou un numéro de reçu invalides", async () => {
    const fichier = await modifier(await service.exporter('ecole'), {
      "Nom de l'école": '',
      Email: 'pas-un-email',
      'Numéroter les reçus à partir de': 'abc',
    });
    const r = await service.apercu('ecole', fichier);
    expect(r.erreurs).toHaveLength(3);
    await expect(service.importer('ecole', fichier)).rejects.toThrow('erreurs');
    expect(configuration.updateEcole).not.toHaveBeenCalled();
  });
});
