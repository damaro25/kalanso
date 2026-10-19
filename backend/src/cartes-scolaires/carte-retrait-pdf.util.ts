import PDFDocument from 'pdfkit';

// Carte de retrait des enfants (maternelle), copie de la planche papier : A4 portrait, 8 cartes de 95 x 68 mm
// (2 colonnes x 4 lignes), chacune encadrée d'un trait fin noir.
const MM = 72 / 25.4;
export const RETRAIT_LARGEUR = 95 * MM;
export const RETRAIT_HAUTEUR = 68 * MM;
const COLONNES = 2;
const LIGNES = 4;
const ECART = 4 * MM;
export const CARTES_RETRAIT_PAR_PAGE = COLONNES * LIGNES;

const A4_LARGEUR = 595.28;
const A4_HAUTEUR = 841.89;
const BLEU = '#4A86E8';

export interface EnteteRetrait {
  ecole: string;
  ministere: string; // « MEN-A »
  dev: string; // « Conakry »
  dce: string; // « Matoto »
  signataire: string; // « La Coordinatrice »
}

export interface CarteRetraitData {
  matricule: string | null;
  niveau: string;
  prenom: string;
  nom: string;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  filiation: string;
  telephone: string;
  adresse: string | null;
}

type Doc = InstanceType<typeof PDFDocument>;

function formaterDate(date: Date | null): string {
  if (!date) return '';
  const jj = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${date.getUTCFullYear()}`;
}

function texte(doc: Doc, t: string, x: number, y: number, largeur: number, police: string, taille: number, align: 'left' | 'center' | 'right' = 'left', couleur = '#000000') {
  doc.font(police).fontSize(taille).fillColor(couleur).text(t, x, y, { width: largeur, height: taille + 2, ellipsis: true, align, lineBreak: false });
}

// « Libellé : valeur » sur une ligne : libellé en gras, valeur en romain, tronquée si trop longue.
function champ(doc: Doc, libelle: string, valeur: string, x: number, y: number, largeur: number, taille = 9) {
  doc.font('Times-Bold').fontSize(taille);
  const etiquette = `${libelle} : `;
  const l = doc.widthOfString(etiquette);
  texte(doc, etiquette, x, y, l + 1, 'Times-Bold', taille);
  texte(doc, valeur, x + l, y, Math.max(largeur - l, 10), 'Times-Roman', taille);
}

function dessinerCarte(doc: Doc, x: number, y: number, carte: CarteRetraitData, entete: EnteteRetrait) {
  const W = RETRAIT_LARGEUR;
  doc.save().lineWidth(0.6).strokeColor('#000000').rect(x, y, W, RETRAIT_HAUTEUR).stroke().restore();

  const m = 8; // marge intérieure
  // En-tête : administration à gauche, République à droite
  texte(doc, entete.ministere, x + m, y + 6, W / 2 - m, 'Times-Bold', 6.5);
  texte(doc, `DEV : ${entete.dev}`, x + m, y + 13.5, W / 2 - m, 'Times-Bold', 6.5);
  texte(doc, `DCE : ${entete.dce}`, x + m, y + 21, W / 2 - m, 'Times-Bold', 6.5);
  texte(doc, 'REPUBLIQUE DE GUINEE', x + W / 2, y + 6, W / 2 - m, 'Times-Bold', 6.5, 'center');
  texte(doc, 'Travail-Justice-Solidarité', x + W / 2, y + 13.5, W / 2 - m, 'Times-Italic', 6, 'center');

  // Nom de l'école au centre
  texte(doc, entete.ecole.toUpperCase(), x + m, y + 29, W - 2 * m, 'Times-Bold', 7, 'center', BLEU);

  // Bandeau « CARTE DE RETRAIT »
  const yb = y + 40;
  doc.save().rect(x + m, yb, W - 2 * m, 15).fill(BLEU).restore();
  texte(doc, 'CARTE DE RETRAIT', x + m, yb + 3.5, W - 2 * m, 'Helvetica-Bold', 9.5, 'center', '#ffffff');

  // Corps
  const largeur = W - 2 * m;
  let yl = yb + 21;
  const pas = 18.5;
  champ(doc, 'Mle', carte.matricule ?? '', x + m, yl, largeur / 2);
  champ(doc, 'Niveau', carte.niveau, x + m + largeur / 2 + 10, yl, largeur / 2 - 10);
  yl += pas;
  champ(doc, 'Prénom', carte.prenom, x + m, yl, largeur);
  yl += pas;
  champ(doc, 'Nom', carte.nom.toUpperCase(), x + m, yl, largeur);
  yl += pas;
  const naissance = [formaterDate(carte.dateNaissance), carte.lieuNaissance ? `à ${carte.lieuNaissance}` : ''].filter(Boolean).join(' ');
  champ(doc, 'Né (e) le', naissance, x + m, yl, largeur);
  yl += pas;
  champ(doc, 'Filiation', carte.filiation, x + m, yl, largeur);
  yl += pas;
  champ(doc, 'Tél', carte.telephone, x + m, yl, largeur * 0.55);
  // Signataire en bas à droite, souligné
  doc.font('Times-Bold').fontSize(8.5);
  const ls = doc.widthOfString(entete.signataire);
  const xs = x + W - m - ls;
  texte(doc, entete.signataire, xs, yl + pas - 2, ls + 2, 'Times-Bold', 8.5);
  doc.save().lineWidth(0.5).strokeColor('#000000').moveTo(xs, yl + pas + 8.2).lineTo(xs + ls, yl + pas + 8.2).stroke().restore();
  yl += pas;
  champ(doc, 'Adresse', carte.adresse ?? '', x + m, yl, largeur * 0.55);
}

function origine(colonne: number, rangee: number) {
  const largeurUtile = COLONNES * RETRAIT_LARGEUR + (COLONNES - 1) * ECART;
  const hauteurUtile = LIGNES * RETRAIT_HAUTEUR + (LIGNES - 1) * ECART;
  const x0 = (A4_LARGEUR - largeurUtile) / 2;
  const y0 = (A4_HAUTEUR - hauteurUtile) / 2;
  return { x: x0 + colonne * (RETRAIT_LARGEUR + ECART), y: y0 + rangee * (RETRAIT_HAUTEUR + ECART) };
}

// Planches A4 de 8 cartes de retrait (recto seul), prêtes à imprimer et découper.
export async function genererCartesRetraitPdf(entete: EnteteRetrait, cartes: CarteRetraitData[]): Promise<Buffer> {
  if (cartes.length === 0) throw new Error('Aucune carte à imprimer');
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 0, autoFirstPage: false, info: { Title: 'Cartes de retrait', Author: entete.ecole } });
    const morceaux: Buffer[] = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);
    try {
      cartes.forEach((carte, i) => {
        const k = i % CARTES_RETRAIT_PAR_PAGE;
        if (k === 0) doc.addPage();
        const { x, y } = origine(k % COLONNES, Math.floor(k / COLONNES));
        dessinerCarte(doc, x, y, carte, entete);
      });
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
