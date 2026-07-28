import PDFDocument from 'pdfkit';

// toLocaleString('fr-FR') separe les milliers par une espace fine insecable
// (U+202F), absente de la police PDF par defaut : elle s'affiche comme un
// caractere parasite au rendu. On la remplace par une espace normale.
function fmt(n: number): string {
  return n.toLocaleString('fr-FR').replace(/ /g, ' ');
}

interface FactureData {
  numero: string;
  ecoleNom: string;
  eleveNom: string;
  eleprenom: string;
  eleveMatricule: string | null;
  libelle: string;
  montantTotal: number;
  montantPaye: number;
  statut: string;
  dateEmission: Date;
  dateEcheance: Date | null;
}

export function genererFacturePdf(data: FactureData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const solde = data.montantTotal - data.montantPaye;

    doc.fontSize(18).text(data.ecoleNom, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('Facture', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Facture N° : ${data.numero}`);
    doc.text(`Date d'émission : ${data.dateEmission.toLocaleDateString('fr-FR').replace(/\//g, ' ')}`);
    if (data.dateEcheance) {
      doc.text(`Date d'échéance : ${data.dateEcheance.toLocaleDateString('fr-FR').replace(/\//g, ' ')}`);
    }
    doc.moveDown();
    doc.text(`Élève : ${data.eleprenom} ${data.eleveNom}`);
    if (data.eleveMatricule) {
      doc.text(`Matricule : ${data.eleveMatricule}`);
    }
    doc.moveDown();
    doc.text(`Libellé : ${data.libelle}`);
    doc.moveDown();

    doc.text(`Montant total : ${fmt(data.montantTotal)} GNF`);
    doc.text(`Montant payé : ${fmt(data.montantPaye)} GNF`);
    doc.moveDown();
    doc.fontSize(13).text(`Reste à payer : ${fmt(solde)} GNF`, { underline: true });
    doc.moveDown();
    doc.fontSize(11).text(`Statut : ${data.statut}`);

    doc.end();
  });
}
