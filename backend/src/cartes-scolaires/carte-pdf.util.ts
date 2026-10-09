import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';

// Format carte bancaire (CR80) : 85,6 x 54 mm. Une planche A4 en porte 10 (2 colonnes x 5 lignes).
const MM = 72 / 25.4;
export const CARTE_LARGEUR = 85.6 * MM;
export const CARTE_HAUTEUR = 54 * MM;
const COLONNES = 2;
const LIGNES = 5;
const ECART = 6;
export const CARTES_PAR_PLANCHE = COLONNES * LIGNES;

const A4_LARGEUR = 595.28;
const A4_HAUTEUR = 841.89;

const BLEU = '#1f4e8c';
const GRIS = '#6b7280';
const CONTOUR = '#b8c0cc';

export interface EcoleCarte {
  nom: string;
  sigle: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
}

export interface CarteData {
  matricule: string | null;
  nom: string;
  prenom: string;
  dateNaissance: Date | null;
  lieuNaissance: string | null;
  classe: string;
  niveau: string;
  photo: Buffer | null; // JPEG ou PNG, les seuls formats que PDFKit sait intégrer
  codeQr: string;
}

type Doc = InstanceType<typeof PDFDocument>;

function formaterDate(date: Date | null): string {
  if (!date) return '';
  const jj = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  return `${jj}/${mm}/${date.getUTCFullYear()}`;
}

// Texte sur une seule ligne, tronqué avec « … » s'il dépasse la largeur donnée.
function ligne(doc: Doc, texte: string, x: number, y: number, largeur: number, taille: number, gras = false, couleur = '#111827', align: 'left' | 'center' | 'right' = 'left') {
  doc
    .font(gras ? 'Helvetica-Bold' : 'Helvetica')
    .fontSize(taille)
    .fillColor(couleur)
    .text(texte, x, y, { width: largeur, height: taille + 2, ellipsis: true, align });
}

function fondCarte(doc: Doc, x: number, y: number, hauteurBandeau: number) {
  doc.save();
  doc.roundedRect(x, y, CARTE_LARGEUR, CARTE_HAUTEUR, 6).lineWidth(0.5).fillAndStroke('#ffffff', CONTOUR);
  doc.restore();
  doc.save();
  doc.roundedRect(x, y, CARTE_LARGEUR, CARTE_HAUTEUR, 6).clip();
  doc.rect(x, y, CARTE_LARGEUR, hauteurBandeau).fill(BLEU);
  doc.restore();
}

function dessinerPhoto(doc: Doc, photo: Buffer | null, x: number, y: number, largeur: number, hauteur: number) {
  doc.save().lineWidth(0.6).strokeColor('#8a94a6').rect(x, y, largeur, hauteur).stroke().restore();
  if (photo) {
    try {
      doc.image(photo, x, y, { fit: [largeur, hauteur], align: 'center', valign: 'center' });
      return;
    } catch {
      // image illisible : on garde le cadre vide plutôt que de bloquer toute la planche
    }
  }
  ligne(doc, 'PHOTO', x, y + hauteur / 2 - 4, largeur, 7, false, '#8a94a6', 'center');
}

// QR code dessiné en vectoriel (net à l'impression, aucun encodage d'image) à partir des modules calculés par `qrcode`.
function dessinerQr(doc: Doc, texte: string, x: number, y: number, taille: number) {
  const { size, data } = QRCode.create(texte, { errorCorrectionLevel: 'M' }).modules;
  const module = taille / size;
  doc.save();
  doc.rect(x - 2, y - 2, taille + 4, taille + 4).fill('#ffffff'); // zone de silence blanche autour du code
  for (let ligne = 0; ligne < size; ligne++) {
    for (let colonne = 0; colonne < size; colonne++) {
      if (data[ligne * size + colonne]) doc.rect(x + colonne * module, y + ligne * module, module + 0.15, module + 0.15);
    }
  }
  doc.fill('#000000');
  doc.restore();
}

function dessinerRecto(doc: Doc, x: number, y: number, carte: CarteData, ecole: EcoleCarte, annee: string) {
  fondCarte(doc, x, y, 30);

  ligne(doc, ecole.nom, x + 8, y + 7, CARTE_LARGEUR - 16, 9, true, '#ffffff', 'center');
  ligne(doc, 'CARTE SCOLAIRE', x + 8, y + 19, CARTE_LARGEUR - 16, 6.5, false, '#dbe7f7', 'center');

  dessinerPhoto(doc, carte.photo, x + 10, y + 38, 62, 80);

  const xi = x + 82;
  const largeur = CARTE_LARGEUR - 82 - 10;
  ligne(doc, carte.nom.toUpperCase(), xi, y + 38, largeur, 10.5, true);
  ligne(doc, carte.prenom, xi, y + 52, largeur, 9.5);

  const naissance = formaterDate(carte.dateNaissance);
  if (naissance) ligne(doc, `Né(e) le ${naissance}`, xi, y + 68, largeur, 7.5, false, GRIS);
  if (carte.lieuNaissance) ligne(doc, `à ${carte.lieuNaissance}`, xi, y + 79, largeur, 7.5, false, GRIS);

  // Le QR code occupe le coin bas droit : les lignes du bas restent à sa gauche.
  const largeurBas = largeur - 48;
  ligne(doc, `Classe : ${carte.classe}`, xi, y + 95, largeurBas, 8, true);
  ligne(doc, 'Matricule', xi, y + 108, largeurBas, 6.5, false, GRIS);
  ligne(doc, carte.matricule ?? 'non attribué', xi, y + 117, largeurBas, 9, true);

  dessinerQr(doc, carte.codeQr, x + CARTE_LARGEUR - 10 - 40, y + CARTE_HAUTEUR - 10 - 40, 40);

  ligne(doc, `Année scolaire ${annee}`, x + 10, y + CARTE_HAUTEUR - 13, 130, 6.5, false, GRIS);
}

function dessinerVerso(doc: Doc, x: number, y: number, ecole: EcoleCarte, annee: string) {
  fondCarte(doc, x, y, 16);
  ligne(doc, ecole.nom, x + 8, y + 4.5, CARTE_LARGEUR - 16, 8, true, '#ffffff', 'center');

  const xt = x + 12;
  const largeur = CARTE_LARGEUR - 24;
  doc.font('Helvetica').fontSize(6.8).fillColor('#111827');
  doc.text("Cette carte est strictement personnelle. Elle doit être présentée à toute demande de l'établissement.", xt, y + 24, { width: largeur });
  doc.moveDown(0.4);
  doc.text("En cas de perte ou de découverte, merci de la rapporter à l'établissement :", xt, doc.y, { width: largeur });

  let yc = doc.y + 4;
  const contact = [ecole.ville, ecole.telephone ? `Tél. ${ecole.telephone}` : null, ecole.email].filter(Boolean) as string[];
  for (const c of contact) {
    ligne(doc, c, xt, yc, largeur, 7.5, true);
    yc += 10;
  }

  ligne(doc, `Valable pour l'année scolaire ${annee}`, xt, y + CARTE_HAUTEUR - 14, 130, 6.5, false, GRIS);
  const xs = x + CARTE_LARGEUR - 12 - 70;
  doc.save().lineWidth(0.5).strokeColor('#111827').moveTo(xs, y + CARTE_HAUTEUR - 18).lineTo(xs + 70, y + CARTE_HAUTEUR - 18).stroke().restore();
  ligne(doc, 'Le Directeur', xs, y + CARTE_HAUTEUR - 14, 70, 6.5, false, GRIS, 'center');
}

function origine(colonne: number, rangee: number) {
  const largeurUtile = COLONNES * CARTE_LARGEUR + (COLONNES - 1) * ECART;
  const hauteurUtile = LIGNES * CARTE_HAUTEUR + (LIGNES - 1) * ECART;
  const x0 = (A4_LARGEUR - largeurUtile) / 2;
  const y0 = (A4_HAUTEUR - hauteurUtile) / 2;
  return { x: x0 + colonne * (CARTE_LARGEUR + ECART), y: y0 + rangee * (CARTE_HAUTEUR + ECART) };
}

// Planches A4 recto/verso. Le verso est en miroir (colonnes inversées) pour que, feuille retournée sur son
// bord long en impression recto verso, chaque verso retombe exactement derrière son recto.
export async function genererPlancheCartesPdf(ecole: EcoleCarte, anneeLibelle: string, cartes: CarteData[]): Promise<Buffer> {
  if (cartes.length === 0) throw new Error('Aucune carte à imprimer');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 0,
      autoFirstPage: false,
      info: { Title: `Cartes scolaires ${anneeLibelle}`, Author: ecole.nom },
    });
    const morceaux: Buffer[] = [];
    doc.on('data', (m) => morceaux.push(m));
    doc.on('end', () => resolve(Buffer.concat(morceaux)));
    doc.on('error', reject);

    try {
      for (let debut = 0; debut < cartes.length; debut += CARTES_PAR_PLANCHE) {
        const lot = cartes.slice(debut, debut + CARTES_PAR_PLANCHE);

        doc.addPage();
        lot.forEach((carte, i) => {
          const { x, y } = origine(i % COLONNES, Math.floor(i / COLONNES));
          dessinerRecto(doc, x, y, carte, ecole, anneeLibelle);
        });

        doc.addPage();
        lot.forEach((_carte, i) => {
          const { x, y } = origine(COLONNES - 1 - (i % COLONNES), Math.floor(i / COLONNES));
          dessinerVerso(doc, x, y, ecole, anneeLibelle);
        });
      }
      doc.end();
    } catch (e) {
      reject(e);
    }
  });
}
