import { apiClient } from './client';

export type SourcePhoto = 'ELEVE' | 'ADMISSION';

// Ce qu'il faut savoir sur un élève pour sa carte scolaire (année en cours).
export interface InfoCarte {
  eleveId: string;
  nomComplet: string;
  matricule: string | null;
  anneeScolaire: { id: string; libelle: string };
  classe: { id: string; nom: string; niveau: string } | null;
  photo: SourcePhoto | null; // d'où vient la photo utilisée sur la carte, null si aucune
  peutGenerer: boolean; // faux tant que l'élève n'a pas de classe cette année
}

export interface ApercuCartesClasse {
  anneeScolaire: { id: string; libelle: string };
  classe: { id: string; nom: string; niveau: string };
  resume: { eleves: number; sansPhoto: number };
  eleves: { eleveId: string; matricule: string | null; nomComplet: string; photo: SourcePhoto | null }[];
}

// Un envoi de photo ou un PDF de classe peut dépasser le délai de 8 s prévu pour les requêtes courantes.
const DELAI_LONG = 60000;

export async function fetchInfoCarte(eleveId: string): Promise<InfoCarte> {
  const { data } = await apiClient.get(`/cartes-scolaires/eleve/${eleveId}`);
  return data;
}

export async function fetchApercuCartesClasse(classeId: string): Promise<ApercuCartesClasse> {
  const { data } = await apiClient.get(`/cartes-scolaires/classe/${classeId}`);
  return data;
}

export async function fetchPhotoEleve(eleveId: string): Promise<Blob> {
  const { data } = await apiClient.get(`/eleves/${eleveId}/photo`, { responseType: 'blob' });
  return data;
}

export async function televerserPhotoEleve(eleveId: string, photo: Blob): Promise<void> {
  const formulaire = new FormData();
  formulaire.append('photo', photo, 'photo.jpg');
  await apiClient.post(`/eleves/${eleveId}/photo`, formulaire, { timeout: DELAI_LONG });
}

export async function supprimerPhotoEleve(eleveId: string): Promise<void> {
  await apiClient.delete(`/eleves/${eleveId}/photo`);
}

async function ouvrirPdf(chemin: string) {
  const response = await apiClient.get(chemin, { responseType: 'blob', timeout: DELAI_LONG });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export const ouvrirCarteEleve = (eleveId: string) => ouvrirPdf(`/cartes-scolaires/eleve/${eleveId}/pdf`);
export const ouvrirCartesClasse = (classeId: string) => ouvrirPdf(`/cartes-scolaires/classe/${classeId}/pdf`);

// Message d'erreur lisible, y compris quand la réponse d'erreur d'un PDF arrive sous forme de blob.
export async function messageErreurCarte(erreur: any, parDefaut: string): Promise<string> {
  // Erreur levée par le navigateur (image illisible...) : son message est déjà rédigé pour l'utilisateur.
  if (!erreur?.isAxiosError) return erreur instanceof Error && erreur.message ? erreur.message : parDefaut;

  const data = erreur.response?.data;
  try {
    const corps = data instanceof Blob ? JSON.parse(await data.text()) : data;
    const message = corps?.message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string' && message) return message;
  } catch {
    // corps illisible : message par défaut
  }
  return erreur.response ? parDefaut : 'le serveur ne répond pas';
}

// Réduit la photo avant l'envoi : le PDF d'une classe embarque chaque photo telle quelle, et une photo de
// téléphone fait plusieurs Mo. Format JPEG, 480 x 640 maximum (rapport 3:4 d'une photo d'identité).
export async function preparerPhoto(fichier: File): Promise<Blob> {
  const url = URL.createObjectURL(fichier);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Image illisible : utilisez une photo JPEG ou PNG"));
      img.src = url;
    });
    const ratio = Math.min(1, 480 / image.naturalWidth, 640 / image.naturalHeight);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error("Impossible de préparer l'image dans ce navigateur");
    ctx.fillStyle = '#ffffff'; // un PNG transparent ne doit pas devenir noir en JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Impossible de préparer l'image"))), 'image/jpeg', 0.88),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
