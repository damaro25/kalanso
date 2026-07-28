import { apiClient } from './client';

export type CategorieMateriel = 'MOBILIER' | 'INFORMATIQUE' | 'PEDAGOGIQUE' | 'AUTRE';
export type EtatMateriel = 'BON' | 'MOYEN' | 'A_REPARER' | 'HORS_SERVICE';

export const CATEGORIES: { value: CategorieMateriel; label: string }[] = [
  { value: 'MOBILIER', label: 'Mobilier' },
  { value: 'INFORMATIQUE', label: 'Informatique' },
  { value: 'PEDAGOGIQUE', label: 'Pédagogique' },
  { value: 'AUTRE', label: 'Autre' },
];

export const ETATS: { value: EtatMateriel; label: string }[] = [
  { value: 'BON', label: 'Bon' },
  { value: 'MOYEN', label: 'Moyen' },
  { value: 'A_REPARER', label: 'À réparer' },
  { value: 'HORS_SERVICE', label: 'Hors service' },
];

export interface Materiel {
  id: string;
  categorie: CategorieMateriel;
  designation: string;
  quantite: number;
  etat: EtatMateriel;
  salleId: string | null;
  salle: { id: string; nom: string } | null;
  description: string | null;
}

export interface CreateMaterielInput {
  categorie: CategorieMateriel;
  designation: string;
  quantite: number;
  etat?: EtatMateriel;
  salleId?: string;
  description?: string;
}

export interface ResumeInventaire {
  nombreReferences: number;
  totalArticles: number;
  parEtat: Record<string, number>;
}

export async function fetchMateriel(filtres: { categorie?: string; etat?: string; salleId?: string } = {}): Promise<Materiel[]> {
  const { data } = await apiClient.get('/materiel', { params: filtres });
  return data;
}

export async function fetchResumeInventaire(): Promise<ResumeInventaire> {
  const { data } = await apiClient.get('/materiel/resume');
  return data;
}

export async function createMateriel(input: CreateMaterielInput): Promise<Materiel> {
  const { data } = await apiClient.post('/materiel', input);
  return data;
}

export async function updateMateriel(id: string, input: Partial<CreateMaterielInput>): Promise<Materiel> {
  const { data } = await apiClient.patch(`/materiel/${id}`, input);
  return data;
}

export async function deleteMateriel(id: string): Promise<void> {
  await apiClient.delete(`/materiel/${id}`);
}

export async function telechargerInventaire() {
  const response = await apiClient.get('/reporting/export/inventaire.xlsx', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'inventaire.xlsx';
  link.click();
}
