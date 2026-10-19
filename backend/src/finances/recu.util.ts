import PDFDocument from 'pdfkit';
import { logoEcole, proportionsLogo } from '../common/pdf/logo.util';
import { montantEnLettres } from '../common/montant-lettres.util';
import { abregerInscription } from './reste-recu.util';

// Reçu de paiement au format du carnet papier de l'école (A5 paysage) : en-tête officiel, logo, montant encadré,
// numéro de reçu en rouge, matricule, niveau et régime, cycle, puis versement, somme en lettres, motif, reste à
// payer détaillé (« 200.000T1 + 230.000T2 + T3 + T-shirt ») et date, signatures du Fondateur et du Percepteur.

export interface RecuData {
  numero: string;
  entete: { ministere: string; dev: string; dce: string };
  adresse: string; // « Matoto – Kissosso Tel : … »
  email: string | null;
  eleveNom: string;
  elevePrenom: string;
  matricule: string | null;
  niveau: string | null; // nom du niveau (ex. MSM, 1ère Année)
  cycle: 'CRECHE' | 'GARDERIE' | 'MATERNELLE' | 'PRIMAIRE' | null;
  regime: 'INTERNAT' | 'SEMI_INTERNAT' | 'EXTERNAT' | 'PENSIONNAT' | null;
  factureLibelle: string; // « Pour »
  montant: number;
  mode: string;
  resteAPayer: number; // reste dû par l'élève sur l'année, après ce paiement
  resteDetail: string; // « 200.000T1 + 230.000T2 + T3 + T-shirt »
  prochaineEcheance: Date | null;
  datePaiement: Date;
}

const BLEU = '#1a237e';
const ROUGE = '#c62828';
const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/[\s  ]/g, '.');
const jour = (d: Date) => d.toLocaleDateString('fr-FR', { timeZone: 'UTC' });

export function genererRecuPdf(data: RecuData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    // A5 paysage : 595 x 420 points
    const doc = new PDFDocument({ size: 'A5', layout: 'landscape', margin: 24 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width;
    const g = 24; // marge
    const droite = W - g;

    const texte = (t: string, x: number, y: number, o: { taille?: number; gras?: boolean; italique?: boolean; couleur?: string; largeur?: number; align?: 'left' | 'center' | 'right' } = {}) => {
      const police = o.gras ? (o.italique ? 'Helvetica-BoldOblique' : 'Helvetica-Bold') : o.italique ? 'Helvetica-Oblique' : 'Helvetica';
      doc.font(police).fontSize(o.taille ?? 9).fillColor(o.couleur ?? 'black');
      doc.text(t, x, y, { width: o.largeur, align: o.align ?? 'left', lineBreak: !!o.largeur });
    };
    const cadre = (x: number, y: number, w: number, h: number, contenu?: string, o: { taille?: number; couleur?: string } = {}) => {
      doc.lineWidth(0.8).strokeColor('black').rect(x, y, w, h).stroke();
      if (contenu) texte(contenu, x + 4, y + (h - (o.taille ?? 10) * 0.75) / 2 - 1, { taille: o.taille ?? 10, couleur: o.couleur ?? BLEU, gras: true, largeur: w - 8 });
    };
    const caseACocher = (x: number, y: number, libelle: string, coche: boolean, w = 28) => {
      texte(libelle, x, y + 2, { taille: 9 });
      const cx = x + doc.widthOfString(libelle) + 4;
      cadre(cx, y, w, 12);
      if (coche) texte('X', cx + w / 2 - 3, y + 1.5, { taille: 10, gras: true, couleur: BLEU });
    };
    // Valeur sur une seule ligne : la taille se réduit si le texte est trop long pour la place disponible.
    const ligne = (libelle: string, valeur: string, x: number, y: number, largeur: number) => {
      texte(libelle, x, y, { taille: 9.5 });
      const debut = x + doc.font('Helvetica').fontSize(9.5).widthOfString(libelle) + 4;
      doc.lineWidth(0.5).dash(1, { space: 2 }).moveTo(debut, y + 11).lineTo(x + largeur, y + 11).stroke().undash();
      const place = x + largeur - debut - 4;
      let taille = 10.5;
      while (taille > 6.5 && doc.font('Helvetica-Bold').fontSize(taille).widthOfString(valeur) > place) taille -= 0.5;
      texte(valeur, debut + 2, y - 1 + (10.5 - taille) / 2, { taille, couleur: BLEU, gras: true, largeur: place, align: 'left' });
    };

    // En-tête officiel
    texte(data.entete.ministere, g, g, { taille: 8, gras: true });
    texte(`DEV : ${data.entete.dev}`, g, g + 10, { taille: 8, gras: true, italique: true });
    texte(`DCE : ${data.entete.dce}`, g, g + 20, { taille: 8, gras: true, italique: true });
    texte('RÉPUBLIQUE DE GUINÉE', W / 2, g, { taille: 10, gras: true, largeur: W / 2 - g, align: 'right' });
    texte('Travail – Justice – Solidarité', W / 2, g + 12, { taille: 8.5, italique: true, largeur: W / 2 - g, align: 'right' });

    // Logo de l'école (bandeau ou carré), au plus 330 x 60 points, et coordonnées
    const ratio = proportionsLogo(doc);
    const largeurLogo = 330;
    const largeurImage = Math.min(largeurLogo, 60 * ratio);
    doc.image(logoEcole().buffer, g + (largeurLogo - largeurImage) / 2, g + 34, { width: largeurImage });
    const yCoord = g + 34 + Math.min(60, largeurLogo / ratio) + 2;
    texte(data.adresse, g, yCoord, { taille: 7, gras: true, largeur: largeurLogo, align: 'center' });
    if (data.email) texte(`Email : ${data.email}`, g, yCoord + 9, { taille: 7, italique: true, largeur: largeurLogo, align: 'center' });

    // Montant encadré
    texte('GNF', droite - 175, g + 62, { taille: 12, gras: true });
    cadre(droite - 140, g + 56, 140, 24, fmt(data.montant), { taille: 14 });

    // Numéro et matricule
    const yNum = yCoord + 26;
    texte('REÇU', 150, yNum + 3, { taille: 12, gras: true });
    texte(`N° ${data.numero}`, 188, yNum, { taille: 15, gras: true, couleur: ROUGE });
    texte('N° Matricule', droite - 210, yNum + 4, { taille: 9.5 });
    cadre(droite - 150, yNum - 2, 150, 20, data.matricule ?? '');

    // Niveau et régime
    const yNiv = yNum + 26;
    texte('Niveau', droite - 290, yNiv + 4, { taille: 9.5 });
    cadre(droite - 255, yNiv - 1, 80, 18, data.niveau ?? '', { taille: 9 });
    caseACocher(droite - 168, yNiv + 2, 'Int.', data.regime === 'INTERNAT' || data.regime === 'PENSIONNAT', 22);
    caseACocher(droite - 112, yNiv + 2, 'S-Int', data.regime === 'SEMI_INTERNAT', 22);
    caseACocher(droite - 50, yNiv + 2, 'Ext', data.regime === 'EXTERNAT', 22);

    // Cycle
    const yCycle = yNiv + 24;
    caseACocher(g + 40, yCycle, 'Crèche', data.cycle === 'CRECHE', 40);
    caseACocher(g + 165, yCycle, 'Garderie', data.cycle === 'GARDERIE', 40);
    caseACocher(g + 300, yCycle, 'Maternelle', data.cycle === 'MATERNELLE', 40);
    caseACocher(g + 440, yCycle, 'Primaire', data.cycle === 'PRIMAIRE', 40);

    // Lignes du reçu
    const yL = yCycle + 26;
    const largeur = W - 2 * g;
    ligne('Versement de :', `${data.elevePrenom} ${data.eleveNom}`, g, yL, largeur);
    const lettres = montantEnLettres(data.montant);
    ligne('La somme de :', `${lettres.charAt(0).toUpperCase()}${lettres.slice(1)} francs guinéens`, g, yL + 20, largeur * 0.64);
    ligne('Pour :', abregerInscription(data.factureLibelle), g + largeur * 0.66, yL + 20, largeur * 0.34);
    ligne('Reste à payer :', data.resteAPayer > 0 ? data.resteDetail || `${fmt(data.resteAPayer)} GNF` : 'Soldé', g, yL + 40, largeur * 0.64);
    ligne('Date :', data.resteAPayer > 0 && data.prochaineEcheance ? jour(data.prochaineEcheance) : '', g + largeur * 0.66, yL + 40, largeur * 0.34);

    // Lieu, date, mode et signatures
    const ySig = yL + 66;
    texte(`Conakry, le ${jour(data.datePaiement)}`, droite - 200, ySig, { taille: 10, italique: true, largeur: 200, align: 'right' });
    texte(`Mode de paiement : ${data.mode}`, g, ySig, { taille: 8, couleur: '#555' });
    texte('Le Fondateur', g, ySig + 18, { taille: 10, gras: true });
    texte('Le Percepteur', droite - 200, ySig + 18, { taille: 10, gras: true, largeur: 200, align: 'center' });
    doc.lineWidth(0.5).dash(1, { space: 2 });
    doc.moveTo(g, ySig + 70).lineTo(g + 180, ySig + 70).stroke();
    doc.moveTo(droite - 190, ySig + 70).lineTo(droite - 10, ySig + 70).stroke();
    doc.undash();

    doc.end();
  });
}
