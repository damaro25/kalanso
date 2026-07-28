import PDFDocument from 'pdfkit';

interface BulletinNoteData {
  matiere: string;
  coefficient: number;
  valeur: number;
  appreciation: string | null;
}

interface BulletinData {
  ecoleNom: string;
  eleveNom: string;
  eleprenom: string;
  classeNom: string;
  anneeScolaireLibelle: string;
  trimestre: number;
  notes: BulletinNoteData[];
  moyenneGenerale: number;
  mention: string;
  rang: number;
  effectifClasse: number;
}

export function genererBulletinPdf(data: BulletinData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(data.ecoleNom, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Bulletin de notes — Trimestre ${data.trimestre}`, { align: 'center' });
    doc.moveDown(2);

    doc.fontSize(11);
    doc.text(`Élève : ${data.eleprenom} ${data.eleveNom}`);
    doc.text(`Classe : ${data.classeNom}`);
    doc.text(`Année scolaire : ${data.anneeScolaireLibelle}`);
    doc.moveDown();

    const colX = { matiere: 50, coefficient: 260, valeur: 340, appreciation: 420 };
    const headerY = doc.y;
    doc.font('Helvetica-Bold');
    doc.text('Matière', colX.matiere, headerY);
    doc.text('Coef.', colX.coefficient, headerY);
    doc.text('Note / 10', colX.valeur, headerY);
    doc.text('Appréciation', colX.appreciation, headerY);
    doc.font('Helvetica');
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    for (const note of data.notes) {
      const rowY = doc.y;
      doc.text(note.matiere, colX.matiere, rowY, { width: 200 });
      doc.text(String(note.coefficient), colX.coefficient, rowY);
      doc.text(note.valeur.toFixed(2), colX.valeur, rowY);
      doc.text(note.appreciation ?? '', colX.appreciation, rowY, { width: 120 });
      doc.moveDown();
    }

    doc.moveDown();
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown();

    doc.fontSize(13).text(`Moyenne générale : ${data.moyenneGenerale.toFixed(2)} / 10`, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(11).text(`Mention : ${data.mention}`);
    doc.text(`Rang : ${data.rang} / ${data.effectifClasse}`);

    doc.end();
  });
}
