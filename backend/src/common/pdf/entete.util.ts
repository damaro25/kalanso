import { logoEcole, proportionsLogo } from './logo.util';

// En-tête des documents PDF : le logo de l'école (téléversé dans Configuration, sinon le logo Mamé-TA) centré, à
// la place du simple nom de l'école. Hauteur limitée pour un logo carré. Laisse le curseur sous le logo.
export function enteteLogo(doc: PDFKit.PDFDocument, largeurMax = 400, hauteurMax = 80) {
  const ratio = proportionsLogo(doc);
  const largeur = Math.min(largeurMax, hauteurMax * ratio);
  const hauteur = largeur / ratio;
  const x = (doc.page.width - largeur) / 2;
  const y = doc.y;
  doc.image(logoEcole().buffer, x, y, { width: largeur });
  doc.x = doc.page.margins.left;
  doc.y = y + hauteur + 8;
}
