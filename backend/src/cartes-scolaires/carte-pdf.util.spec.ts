import { CARTES_PAR_PLANCHE, genererPlancheCartesPdf, type CarteData, type EcoleCarte } from './carte-pdf.util';

// PNG 1x1 valide
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const ecole: EcoleCarte = { nom: 'Groupe Scolaire Les Cimes', sigle: 'GSC', ville: 'Conakry', telephone: '+224 620 00 00 00', email: 'contact@cimes.gn' };

const carte = (i: number, surcharge: Partial<CarteData> = {}): CarteData => ({
  matricule: `2026-${String(i).padStart(3, '0')}`,
  nom: `Nom${i}`,
  prenom: `Prénom${i}`,
  dateNaissance: new Date('2012-03-05T00:00:00Z'),
  lieuNaissance: 'Conakry',
  classe: 'CP1 A',
  niveau: 'CP1',
  photo: null,
  codeQr: `2026-${String(i).padStart(3, '0')}`,
  ...surcharge,
});

const pages = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type \/Page(?!s)/g) ?? []).length;

describe('genererPlancheCartesPdf', () => {
  it('produit un vrai PDF', async () => {
    const pdf = await genererPlancheCartesPdf(ecole, '2026-2027', [carte(1)]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('place 10 cartes par planche et ajoute une page de versos après chaque page de recto', async () => {
    expect(CARTES_PAR_PLANCHE).toBe(10);
    expect(pages(await genererPlancheCartesPdf(ecole, '2026-2027', [carte(1)]))).toBe(2);
    expect(pages(await genererPlancheCartesPdf(ecole, '2026-2027', Array.from({ length: 10 }, (_, i) => carte(i))))).toBe(2);
    expect(pages(await genererPlancheCartesPdf(ecole, '2026-2027', Array.from({ length: 11 }, (_, i) => carte(i))))).toBe(4);
    expect(pages(await genererPlancheCartesPdf(ecole, '2026-2027', Array.from({ length: 25 }, (_, i) => carte(i))))).toBe(6);
  });

  it('intègre une photo PNG valide', async () => {
    const sans = await genererPlancheCartesPdf(ecole, '2026-2027', [carte(1)]);
    const avec = await genererPlancheCartesPdf(ecole, '2026-2027', [carte(1, { photo: PNG })]);
    expect(avec.length).toBeGreaterThan(sans.length);
  });

  it("ne plante pas sur une photo illisible : le cadre reste vide et le reste de la planche est produit", async () => {
    const pdf = await genererPlancheCartesPdf(ecole, '2026-2027', [carte(1, { photo: Buffer.from('ceci n\'est pas une image') }), carte(2)]);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pages(pdf)).toBe(2);
  });

  it('supporte les champs facultatifs absents et les noms très longs', async () => {
    const pdf = await genererPlancheCartesPdf({ nom: 'École', sigle: null, ville: null, telephone: null, email: null }, '2026-2027', [
      carte(1, { matricule: null, dateNaissance: null, lieuNaissance: null, nom: 'Camara-Diallo-Bangoura-Soumah'.repeat(3), prenom: 'Mamadou Lamine Saliou'.repeat(3) }),
    ]);
    expect(pages(pdf)).toBe(2);
  });

  it('refuse une liste vide', async () => {
    await expect(genererPlancheCartesPdf(ecole, '2026-2027', [])).rejects.toThrow('Aucune carte');
  });
});
