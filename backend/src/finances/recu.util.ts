import PDFDocument from 'pdfkit';

interface RecuData {
  numero: string;
  ecoleNom: string;
  eleveNom: string;
  eleprenom: string;
  factureLibelle: string;
  montant: number;
  mode: string;
  datePaiement: Date;
}

export function genererRecuPdf(data: RecuData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(data.ecoleNom, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text('Reçu de paiement', { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Reçu N° : ${data.numero}`);
    doc.text(`Date : ${data.datePaiement.toLocaleDateString('fr-FR').replace(/\//g, ' ')}`);
    doc.moveDown();
    doc.text(`Élève : ${data.eleprenom} ${data.eleveNom}`);
    doc.text(`Motif : ${data.factureLibelle}`);
    doc.text(`Mode de paiement : ${data.mode}`);
    doc.moveDown();
    doc.fontSize(13).text(`Montant reçu : ${data.montant.toLocaleString('fr-FR').replace(/\u202f/g, ' ')} GNF`, { underline: true });

    doc.end();
  });
}
