import PDFDocument from 'pdfkit';

export interface CreneauPdfData {
  jour: string;
  heureDebut: string;
  heureFin: string;
  matiere: string;
  enseignant: string | null;
  salle: string | null;
}

interface EmploiDuTempsData {
  ecoleNom: string;
  classeNom: string;
  niveauNom: string;
  anneeScolaireLibelle: string;
  creneaux: CreneauPdfData[];
}

export function genererEmploiDuTempsPdf(data: EmploiDuTempsData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text(data.ecoleNom, { align: 'center' });
    doc.moveDown();
    doc.fontSize(14).text(`Emploi du temps — ${data.classeNom} (${data.niveauNom})`, { align: 'center' });
    doc.fontSize(11).text(`Année scolaire : ${data.anneeScolaireLibelle}`, { align: 'center' });
    doc.moveDown(1.5);

    const jours = [...new Set(data.creneaux.map((c) => c.jour))];

    const colX = { horaire: 50, matiere: 170, enseignant: 310, salle: 460 };

    for (const jour of jours) {
      doc.fontSize(13).font('Helvetica-Bold').text(jour, 50);
      doc.font('Helvetica').fontSize(10);
      doc.moveDown(0.3);

      const headerY = doc.y;
      doc.font('Helvetica-Bold');
      doc.text('Horaire', colX.horaire, headerY);
      doc.text('Matière', colX.matiere, headerY);
      doc.text('Enseignant', colX.enseignant, headerY);
      doc.text('Salle', colX.salle, headerY);
      doc.font('Helvetica');
      doc.moveDown(0.3);
      doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
      doc.moveDown(0.3);

      for (const creneau of data.creneaux.filter((c) => c.jour === jour)) {
        const rowY = doc.y;
        doc.text(`${creneau.heureDebut} – ${creneau.heureFin}`, colX.horaire, rowY);
        doc.text(creneau.matiere, colX.matiere, rowY, { width: 130 });
        doc.text(creneau.enseignant ?? '—', colX.enseignant, rowY, { width: 140 });
        doc.text(creneau.salle ?? '—', colX.salle, rowY, { width: 90 });
        doc.moveDown(0.8);
      }

      doc.moveDown(1);
    }

    if (data.creneaux.length === 0) {
      doc.fontSize(11).text('Aucun créneau défini pour cette classe.', 50);
    }

    doc.end();
  });
}
