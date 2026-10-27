import PDFDocument from 'pdfkit';
import { CARTES_RETRAIT_PAR_PAGE, genererCartesRetraitPdf, type CarteRetraitData, type EnteteRetrait } from './carte-retrait-pdf.util';
import { genererPlancheCartesPdf, type CarteData } from './carte-pdf.util';
import { estMaternelle, formaterFiliation, formaterTelephone, telephoneContact, type LienParentCarte } from './filiation-carte.util';
import { CartesScolairesService } from './cartes-scolaires.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

const lien = (lienParente: string, prenom: string, nom: string, telephone: string | null = null, contactPrincipal = false): LienParentCarte => ({
  lien: lienParente,
  contactPrincipal,
  parentTuteur: { prenom, nom, telephone },
});

// Textes écrits dans le PDF (les flux sont compressés : on écoute les appels à doc.text)
async function textesEcrits(generer: () => Promise<Buffer>) {
  const espion = jest.spyOn(PDFDocument.prototype as any, 'text');
  try {
    await generer();
    return espion.mock.calls.map((c) => String(c[0]));
  } finally {
    espion.mockRestore();
  }
}

describe('formaterFiliation', () => {
  it('père et mère : « <père> et de <mère> »', () => {
    expect(formaterFiliation([lien('Parent', 'X', 'Y', null, true), lien('Père', 'Sidiki', 'Baba'), lien('Mère', 'Hawa P.', "N'DEYE")])).toBe(
      "Sidiki Baba et de Hawa P. N'DEYE",
    );
  });

  it('un seul des deux : son nom seul', () => {
    expect(formaterFiliation([lien('Mère', 'Hawa', 'Bah')])).toBe('Hawa Bah');
    expect(formaterFiliation([lien('Père', 'Sidiki', 'Baba'), lien('Parent', 'X', 'Y', null, true)])).toBe('Sidiki Baba');
  });

  it('sans père ni mère : repli sur le contact principal ; rien : vide', () => {
    expect(formaterFiliation([lien('Tante', 'A', 'B'), lien('Parent', 'Kalilou', 'Camara', null, true)])).toBe('Kalilou Camara');
    expect(formaterFiliation([])).toBe('');
    expect(formaterFiliation(undefined)).toBe('');
  });
});

describe('téléphone et maternelle', () => {
  it('téléphone du contact principal, formaté par groupes', () => {
    const liens = [lien('Père', 'A', 'B', '620000000'), lien('Parent', 'C', 'D', '626912827', true)];
    expect(formaterTelephone(telephoneContact(liens))).toBe('626 91 28 27');
    expect(formaterTelephone('+224626912827')).toBe('+224 626 91 28 27');
    expect(formaterTelephone('12 34')).toBe('12 34');
    expect(formaterTelephone(null)).toBe('');
  });

  it('reconnaît la maternelle par le cycle ou le niveau', () => {
    expect(estMaternelle({ nom: 'PSM', cycle: 'Maternelle' })).toBe(true);
    expect(estMaternelle({ nom: 'GS', cycle: 'Préscolaire' })).toBe(true);
    expect(estMaternelle({ nom: 'Crèche', cycle: null })).toBe(true);
    expect(estMaternelle({ nom: 'CP1', cycle: 'Primaire' })).toBe(false);
  });
});

describe('genererCartesRetraitPdf (planche papier, 8 cartes par page)', () => {
  const entete: EnteteRetrait = { ecole: 'Les Écoles Mamé-TA', ministere: 'MEN-A', dev: 'Conakry', dce: 'Matoto', signataire: 'La Coordinatrice' };
  const carte = (i: number): CarteRetraitData => ({
    matricule: `513PS0${i}`,
    niveau: 'PSM',
    prenom: 'Aïcha',
    nom: 'Camara',
    dateNaissance: new Date('2019-10-05T00:00:00Z'),
    lieuNaissance: 'Conakry',
    filiation: "Sidiki Baba et de Hawa P. N'DEYE",
    telephone: '626 91 28 27',
    adresse: 'Kissosso',
  });

  it('une page par lot de 8 cartes', async () => {
    expect(CARTES_RETRAIT_PAR_PAGE).toBe(8);
    for (const [n, attendu] of [[1, 1], [8, 1], [9, 2], [17, 3]]) {
      const pdf = await genererCartesRetraitPdf(entete, Array.from({ length: n }, (_, i) => carte(i)));
      expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
      expect(pages(pdf)).toBe(attendu);
    }
  });

  it("reproduit l'en-tête, le bandeau, les champs et le signataire", async () => {
    const textes = await textesEcrits(() => genererCartesRetraitPdf(entete, [carte(1)]));
    for (const attendu of [
      'MEN-A', 'DEV : Conakry', 'DCE : Matoto', 'REPUBLIQUE DE GUINEE', 'Travail-Justice-Solidarité', 'LES ÉCOLES MAMÉ-TA',
      'CARTE DE RETRAIT', '513PS01', 'PSM', 'Aïcha', 'CAMARA', '05/10/2019 à Conakry', "Sidiki Baba et de Hawa P. N'DEYE",
      '626 91 28 27', 'Kissosso', 'La Coordinatrice',
    ]) {
      expect(textes).toContain(attendu);
    }
  });

  it('refuse une liste vide', async () => {
    await expect(genererCartesRetraitPdf(entete, [])).rejects.toThrow('Aucune carte');
  });
});

describe('carte scolaire : ligne Filiation', () => {
  const base: CarteData = {
    matricule: 'M1', nom: 'Camara', prenom: 'Aïcha', dateNaissance: null, lieuNaissance: null, classe: 'PSM', niveau: 'PSM', photo: null, codeQr: 'M1',
  };
  const ecole = { nom: 'École', sigle: null, ville: null, telephone: null, email: null };

  it('ajoute « Filiation : … » quand elle est connue, rien sinon', async () => {
    const avec = await textesEcrits(() => genererPlancheCartesPdf(ecole, '2026-2027', [{ ...base, filiation: 'Sidiki Baba et de Hawa Bah' }]));
    expect(avec).toContain('Filiation : Sidiki Baba et de Hawa Bah');
    const sans = await textesEcrits(() => genererPlancheCartesPdf(ecole, '2026-2027', [base]));
    expect(sans.some((t) => t.startsWith('Filiation'))).toBe(false);
  });
});

describe('CartesScolairesService : cartes de retrait', () => {
  let prisma: any;
  let service: CartesScolairesService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CartesScolairesService(prisma);
    prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
    prisma.ecole.findUniqueOrThrow.mockResolvedValue({ nom: 'Les Écoles Mamé-TA', carteRetraitDev: null, carteRetraitSignataire: 'le Directeur Général' });
  });

  it('signale les classes de maternelle', async () => {
    prisma.classe.findMany.mockResolvedValue([
      { id: 'c1', nom: 'PSM', niveau: { nom: 'PSM', cycle: 'Maternelle' }, _count: { inscriptions: 12 } },
      { id: 'c2', nom: 'CP1 A', niveau: { nom: 'CP1', cycle: 'Primaire' }, _count: { inscriptions: 30 } },
    ]);
    const r = await service.classesRetrait('ecole');
    expect(r.classes.map((c) => [c.nom, c.maternelle, c.effectif])).toEqual([
      ['PSM', true, 12],
      ['CP1 A', false, 30],
    ]);
  });

  it("génère les cartes d'élèves choisis, inscrits cette année, avec filiation et téléphone", async () => {
    prisma.inscription.findMany.mockResolvedValue([
      {
        classe: { niveau: { nom: 'PSM' } },
        eleve: {
          matricule: '513PS022', prenom: 'Aïcha', nom: 'Camara', dateNaissance: null, lieuNaissance: null, adresse: 'Kissosso',
          parentsLiens: [lien('Parent', 'Kalilou', 'Camara', '626912827', true), lien('Père', 'Kalilou', 'Camara'), lien('Mère', 'Hawa', 'Bah')],
        },
      },
    ]);
    const textes = await textesEcrits(async () => (await service.pdfRetraitEleves('ecole', ['e1', 'e1', ''])).pdf);
    expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({
      ecoleId: 'ecole', anneeScolaireId: 'a1', statut: 'EN_COURS', eleveId: { in: ['e1'] },
    });
    expect(textes).toEqual(expect.arrayContaining(['Kalilou Camara et de Hawa Bah', '626 91 28 27', 'le Directeur Général', 'DEV : Conakry']));
  });

  it('refuse une liste vide ou des élèves non inscrits', async () => {
    await expect(service.pdfRetraitEleves('ecole', [''])).rejects.toThrow('au moins un élève');
    prisma.inscription.findMany.mockResolvedValue([]);
    await expect(service.pdfRetraitEleves('ecole', ['e9'])).rejects.toThrow("n'est inscrit");
  });
});
