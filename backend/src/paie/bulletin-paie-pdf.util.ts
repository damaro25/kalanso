import PDFDocument from 'pdfkit';

const MOIS_LABELS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

interface LignePaieData {
  libelle: string;
  imposable: boolean;
  montantGain: number;
  montantRetenue: number;
}

interface BulletinPaieData {
  ecoleNom: string;
  personnelNom: string;
  personnelPrenom: string;
  matricule: string | null;
  fonction: string;
  mois: number;
  annee: number;
  nombreHeures: number | null;
  lignes: LignePaieData[];
  totalGains: number;
  totalRetenues: number;
  netAPayer: number;
  modePaiement: string | null;
  statut: string;
}

function fmt(n: number): string {
  // toLocaleString('fr-FR') sépare les milliers par une espace fine insécable
  // (U+202F), absente de la police PDF par défaut : elle s'affiche comme un
  // caractère parasite ("/") au rendu. On la remplace par une espace normale.
  return n.toLocaleString('fr-FR').replace(/ /g, ' ');
}

export function genererBulletinPaiePdf(data: BulletinPaieData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(data.ecoleNom, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Bulletin de salaire — ${MOIS_LABELS[data.mois]} ${data.annee}`, { align: 'center' });
    doc.moveDown(1.5);

    doc.fontSize(11);
    doc.text(`Employé : ${data.personnelPrenom} ${data.personnelNom}`);
    if (data.matricule) doc.text(`Matricule : ${data.matricule}`);
    doc.text(`Fonction : ${data.fonction}`);
    if (data.nombreHeures != null) doc.text(`Nombre d'heures : ${data.nombreHeures}`);
    doc.moveDown();

    const colX = { libelle: 50, imposable: 260, gain: 350, retenue: 460 };
    const headerY = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Libellé', colX.libelle, headerY);
    doc.text('Imposable', colX.imposable, headerY);
    doc.text('Gain', colX.gain, headerY);
    doc.text('Retenue', colX.retenue, headerY);
    doc.font('Helvetica');
    doc.moveDown(0.4);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.4);

    for (const ligne of data.lignes) {
      const rowY = doc.y;
      doc.text(ligne.libelle, colX.libelle, rowY, { width: 200 });
      doc.text(ligne.imposable ? 'Oui' : 'Non', colX.imposable, rowY);
      doc.text(ligne.montantGain > 0 ? fmt(ligne.montantGain) : '—', colX.gain, rowY);
      doc.text(ligne.montantRetenue > 0 ? fmt(ligne.montantRetenue) : '—', colX.retenue, rowY);
      doc.moveDown(0.6);
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.4);

    const totalY = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('TOTAL', colX.libelle, totalY);
    doc.text(fmt(data.totalGains), colX.gain, totalY);
    doc.text(fmt(data.totalRetenues), colX.retenue, totalY);
    doc.font('Helvetica');
    doc.moveDown(1.2);

    doc.fontSize(13).text(`NET À PAYER : ${fmt(data.netAPayer)} GNF`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11);
    if (data.modePaiement) doc.text(`Mode de paiement : ${data.modePaiement}`);
    doc.text(`Statut : ${data.statut}`);

    doc.end();
  });
}
