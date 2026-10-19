import * as ExcelJS from 'exceljs';
import { ElevesImportExportService, lireDate, lireGenre, lireRegime } from './eleves-import-export.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

async function classeur(lignes: (string | number | Date)[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Élèves');
  lignes.forEach((l) => ws.addRow(l));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const ENTETE = ['Matricule', 'Nom', 'Prénom', 'Genre (M/F)', 'Date de naissance', 'Classe', 'Régime', 'Contact - prénom', 'Contact - nom', 'Contact - téléphone', 'Père - prénom', 'Père - nom'];

describe('ElevesImportExportService', () => {
  let prisma: any;
  let eleves: { inscrire: jest.Mock };
  let service: ElevesImportExportService;

  beforeEach(() => {
    prisma = createPrismaMock();
    eleves = { inscrire: jest.fn().mockResolvedValue({}) };
    service = new ElevesImportExportService(prisma, eleves as any);
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    prisma.classe.findMany.mockResolvedValue([{ id: 'c1', nom: 'CP1 A', niveau: { nom: 'CP1' } }]);
    prisma.niveau.findMany.mockResolvedValue([{ id: 'n1', nom: 'CP1', ordre: 1 }]);
    prisma.eleve.findMany.mockResolvedValue([
      { id: 'e1', matricule: 'MT-001', nom: 'Diallo', prenom: 'Aïssatou', dateNaissance: null, actif: true },
      { id: 'e2', matricule: null, nom: 'Bah', prenom: 'Ousmane', dateNaissance: new Date('2015-05-02'), actif: true },
    ]);
  });

  describe('lecture des cellules', () => {
    it('reconnaît genres, régimes et dates usuels', () => {
      expect([lireGenre('Fille'), lireGenre('m'), lireGenre('X')]).toEqual(['F', 'M', null]);
      expect([lireRegime('semi internat'), lireRegime('Pensionnat'), lireRegime('cantine')]).toEqual(['SEMI_INTERNAT', 'PENSIONNAT', null]);
      expect((lireDate('14/03/2016') as Date).toISOString().slice(0, 10)).toBe('2016-03-14');
      expect(lireDate('31/02/2016')).toBe('invalide');
      expect((lireDate(42370) as Date).toISOString().slice(0, 10)).toBe('2016-01-01');
      expect(lireDate('')).toBeNull();
    });
  });

  describe('apercu', () => {
    it('distingue création, mise à jour (matricule ou nom) et erreurs, sans rien enregistrer', async () => {
      const buffer = await classeur([
        ENTETE,
        ['MT-001', 'DIALLO', 'Aissatou', '', '', 'CP1 A', 'Internat'],
        ['', 'Bah', 'Ousmane', 'M', '02/05/2015'],
        ['', 'Camara', 'Fanta', 'F', '', 'cp1 a'],
        ['', 'Sylla', 'Ibrahima', '', '', 'CM2 B', 'Cantine'],
        ['', 'Camara', 'Fanta', 'F'],
      ]);
      const r = await service.apercu('ecole', buffer);
      expect(r.lignes.map((l) => [l.ligne, l.action])).toEqual([
        [2, 'METTRE_A_JOUR'],
        [3, 'METTRE_A_JOUR'],
        [4, 'CREER'],
        [5, 'ERREUR'],
        [6, 'ERREUR'],
      ]);
      expect(r.lignes[3].erreurs).toEqual([
        'Régime « Cantine » non reconnu',
        'Genre manquant (M ou F)',
      ]);
      expect(r.lignes[4].erreurs).toEqual(['Même élève que la ligne 4']);
      expect(r).toMatchObject({ aCreer: 1, aMettreAJour: 2, enErreur: 2 });
      // classe absente : elle sera créée, avec son niveau (ici le nom de la classe, faute de colonne Niveau)
      expect(r).toMatchObject({ classesACreer: ['CM2 B'], niveauxACreer: ['CM2 B'] });
      expect(r.lignes[0]).not.toHaveProperty('donnees');
      expect(prisma.eleve.create).not.toHaveBeenCalled();
    });

    it("à l'import, crée la classe absente et son niveau, puis y inscrit l'élève", async () => {
      prisma.eleve.create.mockResolvedValue({ id: 'nouveau' });
      prisma.eleveParent.findFirst.mockResolvedValue(null);
      prisma.classe.findFirst.mockResolvedValue(null);
      prisma.niveau.create.mockResolvedValue({ id: 'n-cm2', nom: 'CM2', ordre: 2 });
      prisma.classe.create.mockResolvedValue({ id: 'c-cm2b' });
      const buffer = await classeur([
        [...ENTETE.slice(0, 6), 'Niveau'],
        ['', 'Sylla', 'Ibrahima', 'M', '', 'CM2 B', 'CM2'],
        ['', 'Keita', 'Awa', 'F', '', 'CM2 B', 'CM2'],
      ]);
      const r = await service.importer('ecole', buffer);
      expect(r).toMatchObject({ crees: 2, niveauxCrees: ['CM2'], classesCrees: ['CM2 B'], erreurs: [] });
      expect(prisma.niveau.create).toHaveBeenCalledWith({ data: { ecoleId: 'ecole', nom: 'CM2', ordre: 2 } });
      expect(prisma.classe.create).toHaveBeenCalledTimes(1);
      expect(eleves.inscrire.mock.calls.map((c) => c[1].classeId)).toEqual(['c-cm2b', 'c-cm2b']);
    });

    it('refuse un fichier sans colonnes Nom et Prénom', async () => {
      await expect(service.apercu('ecole', await classeur([['Élève', 'Classe']]))).rejects.toThrow('Colonnes Nom et Prénom');
    });
  });

  describe('importer', () => {
    it('crée le nouvel élève avec son contact et sa filiation, met à jour l’existant, et inscrit en classe', async () => {
      prisma.eleve.create.mockResolvedValue({ id: 'nouveau' });
      prisma.eleveParent.findFirst.mockResolvedValue(null);
      prisma.parentTuteur.create.mockResolvedValue({ id: 'p' });
      const buffer = await classeur([
        ENTETE,
        ['', 'Camara', 'Fanta', 'F', '01/09/2016', 'CP1 A', 'Semi-internat', 'Mariama', 'Bah', '620000000', 'Sekou', 'Camara'],
        ['MT-001', 'Diallo', 'Aïssatou', '', '', '', ''],
        ['', 'Sans', '', 'M'],
      ]);
      const r = await service.importer('ecole', buffer);

      expect(r).toEqual({ crees: 1, misAJour: 1, erreurs: [{ ligne: 4, motif: 'Prénom manquant' }], niveauxCrees: [], classesCrees: [] });
      expect(prisma.eleve.create.mock.calls[0][0].data).toMatchObject({
        ecoleId: 'ecole',
        nom: 'Camara',
        prenom: 'Fanta',
        genre: 'F',
        dateNaissance: new Date(Date.UTC(2016, 8, 1)),
      });
      // Contact principal puis père (filiation)
      expect(prisma.eleveParent.create.mock.calls.map((c: any) => [c[0].data.lien, c[0].data.contactPrincipal])).toEqual([
        ['Parent', true],
        ['Père', false],
      ]);
      expect(eleves.inscrire).toHaveBeenCalledWith('ecole', { eleveId: 'nouveau', classeId: 'c1', regime: 'SEMI_INTERNAT' });
      // Mise à jour : les cellules vides n'effacent rien.
      expect(prisma.eleve.update).toHaveBeenCalledWith({
        where: { id: 'e1' },
        data: { nom: 'Diallo', prenom: 'Aïssatou', matricule: 'MT-001' },
      });
      expect(eleves.inscrire).toHaveBeenCalledTimes(1);
    });

    it("rapporte l'échec d'une ligne sans bloquer les autres", async () => {
      prisma.eleve.create.mockResolvedValue({ id: 'nouveau' });
      eleves.inscrire.mockRejectedValueOnce(new Error('Année clôturée'));
      const buffer = await classeur([ENTETE, ['', 'Camara', 'Fanta', 'F', '', 'CP1 A'], ['', 'Keita', 'Moussa', 'M']]);
      const r = await service.importer('ecole', buffer);
      expect(r).toEqual({ crees: 1, misAJour: 0, erreurs: [{ ligne: 2, motif: 'Année clôturée' }], niveauxCrees: [], classesCrees: [] });
    });
  });

  describe('modele / exporter', () => {
    it("le modèle et l'export se relisent à l'import", async () => {
      prisma.eleve.findMany.mockResolvedValueOnce([
        {
          id: 'e1',
          matricule: 'MT-001',
          nom: 'Diallo',
          prenom: 'Aïssatou',
          genre: 'F',
          dateNaissance: new Date(Date.UTC(2016, 2, 14)),
          lieuNaissance: 'Conakry',
          adresse: null,
          inscriptions: [{ regime: 'INTERNAT', classe: { nom: 'CP1 A', niveau: { nom: 'CP1' } } }],
          parentsLiens: [
            { lien: 'Mère', contactPrincipal: true, parentTuteur: { prenom: 'Mariama', nom: 'Bah', telephone: '62', email: null, profession: null } },
          ],
        },
      ]);
      const exporte = await service.exporter('ecole');
      const r = await service.apercu('ecole', exporte);
      expect(r.colonnesIgnorees).toEqual([]);
      expect(r.lignes).toEqual([
        expect.objectContaining({ action: 'METTRE_A_JOUR', matricule: 'MT-001', classe: 'CP1 A', regime: 'INTERNAT' }),
      ]);

      // Modèle : en-têtes reconnus, aucune ligne à importer (l'exemple est sur la feuille d'aide).
      const modele = await service.modele('ecole');
      await expect(service.apercu('ecole', modele)).rejects.toThrow('Aucun élève trouvé');
    });
  });
});
