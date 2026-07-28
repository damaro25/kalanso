import { apiClient } from './client';

export interface Livre {
  id: string;
  titre: string;
  auteur: string | null;
  isbn: string | null;
  categorie: string | null;
  quantiteTotale: number;
  quantiteEmpruntee: number;
  quantiteDisponible: number;
}

export interface CreateLivreInput {
  titre: string;
  auteur?: string;
  isbn?: string;
  categorie?: string;
  quantiteTotale: number;
}

export type UpdateLivreInput = Partial<CreateLivreInput>;

export type StatutEmprunt = 'EN_COURS' | 'RETOURNE';

export interface Emprunt {
  id: string;
  livre: { id: string; titre: string };
  eleve: { id: string; nom: string; prenom: string; matricule: string | null };
  dateEmprunt: string;
  dateRetourPrevue: string;
  dateRetourEffective: string | null;
  statut: StatutEmprunt;
  enRetard: boolean;
}

export interface CreateEmpruntInput {
  livreId: string;
  eleveId: string;
  dateRetourPrevue?: string;
}

export interface ResumeBibliotheque {
  nbTitres: number;
  totalExemplaires: number;
  empruntsEnCours: number;
  enRetard: number;
}

export async function fetchResumeBibliotheque(): Promise<ResumeBibliotheque> {
  const { data } = await apiClient.get('/bibliotheque/resume');
  return data;
}

export async function fetchLivres(): Promise<Livre[]> {
  const { data } = await apiClient.get('/bibliotheque/livres');
  return data;
}

export async function createLivre(input: CreateLivreInput): Promise<Livre> {
  const { data } = await apiClient.post('/bibliotheque/livres', input);
  return data;
}

export async function updateLivre(id: string, input: UpdateLivreInput): Promise<Livre> {
  const { data } = await apiClient.patch(`/bibliotheque/livres/${id}`, input);
  return data;
}

export async function deleteLivre(id: string): Promise<void> {
  await apiClient.delete(`/bibliotheque/livres/${id}`);
}

export async function fetchEmprunts(statut?: StatutEmprunt): Promise<Emprunt[]> {
  const { data } = await apiClient.get('/bibliotheque/emprunts', { params: statut ? { statut } : {} });
  return data;
}

export async function emprunterLivre(input: CreateEmpruntInput): Promise<Emprunt> {
  const { data } = await apiClient.post('/bibliotheque/emprunts', input);
  return data;
}

export async function retournerEmprunt(id: string): Promise<Emprunt> {
  const { data } = await apiClient.post(`/bibliotheque/emprunts/${id}/retour`);
  return data;
}
