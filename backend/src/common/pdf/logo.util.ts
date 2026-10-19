import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { LOGO_MAMETA_PNG } from './logo-mameta';

// Logo de l'école : celui téléversé depuis Configuration (uploads/logo/logo.png|jpg, sous le dossier courant du
// serveur, comme les photos des élèves ; dans la version bureau, le dossier des données), sinon le logo Mamé-TA
// intégré. Une seule école par installation : un seul logo.
export const DOSSIER_LOGO = join(process.cwd(), 'uploads', 'logo');
export const MIMES_LOGO = ['image/png', 'image/jpeg'];
export const TAILLE_MAX_LOGO = 2 * 1024 * 1024;

let cache: { buffer: Buffer; mime: string; personnalise: boolean } | null = null;

function fichierLogo(): { chemin: string; mime: string } | null {
  for (const [ext, mime] of [
    ['png', 'image/png'],
    ['jpg', 'image/jpeg'],
  ] as const) {
    const chemin = join(DOSSIER_LOGO, `logo.${ext}`);
    if (existsSync(chemin)) return { chemin, mime };
  }
  return null;
}

export function logoEcole(): { buffer: Buffer; mime: string; personnalise: boolean } {
  if (cache) return cache;
  const f = fichierLogo();
  cache = f
    ? { buffer: readFileSync(f.chemin), mime: f.mime, personnalise: true }
    : { buffer: LOGO_MAMETA_PNG, mime: 'image/png', personnalise: false };
  return cache;
}

export function enregistrerLogo(buffer: Buffer, mime: string) {
  if (!MIMES_LOGO.includes(mime)) throw new Error('Le logo doit être une image PNG ou JPEG');
  mkdirSync(DOSSIER_LOGO, { recursive: true });
  supprimerLogo();
  writeFileSync(join(DOSSIER_LOGO, mime === 'image/png' ? 'logo.png' : 'logo.jpg'), buffer);
  cache = null;
}

export function supprimerLogo() {
  rmSync(join(DOSSIER_LOGO, 'logo.png'), { force: true });
  rmSync(join(DOSSIER_LOGO, 'logo.jpg'), { force: true });
  cache = null;
}

// Proportions du logo (largeur / hauteur), pour le placer sans le déformer
export function proportionsLogo(doc: PDFKit.PDFDocument): number {
  const image = (doc as unknown as { openImage: (b: Buffer) => { width: number; height: number } }).openImage(logoEcole().buffer);
  return image.width / image.height;
}
