import { apiClient } from './client';
import type { Eleve } from './eleves';

export interface Niveau {
  id: string;
  nom: string;
  cycle: string | null;
  ordre: number;
}

export interface AnneeScolaire {
  id: string;
  libelle: string;
  courante: boolean;
}

export interface Classe {
  id: string;
  nom: string;
  capaciteMax: number | null;
  niveau: Niveau;
  anneeScolaire: AnneeScolaire;
  _count: { inscriptions: number };
}

export interface Effectif {
  classeId: string;
  nom: string;
  capaciteMax: number | null;
  niveau: string;
  anneeScolaire: string;
  fraisInscription: string;
  ecolage: string;
  filles: number;
  garcons: number;
  total: number;
}

export interface CreateClasseInput {
  nom: string;
  niveauId: string;
  anneeScolaireId: string;
  capaciteMax?: number;
}

export interface CreateAnneeScolaireInput {
  libelle: string;
  dateDebut: string;
  dateFin: string;
}

export async function fetchClasses(): Promise<Classe[]> {
  const { data } = await apiClient.get('/classes');
  return data;
}

export async function fetchEffectifs(): Promise<Effectif[]> {
  const { data } = await apiClient.get('/classes/effectifs');
  return data;
}

export async function fetchClasseEleves(classeId: string): Promise<Eleve[]> {
  const { data } = await apiClient.get(`/classes/${classeId}/eleves`);
  return data;
}

export async function createClasse(input: CreateClasseInput): Promise<Classe> {
  const { data } = await apiClient.post('/classes', input);
  return data;
}

export interface UpdateClasseInput {
  nom?: string;
  capaciteMax?: number;
}

export async function updateClasse(id: string, input: UpdateClasseInput): Promise<Classe> {
  const { data } = await apiClient.patch(`/classes/${id}`, input);
  return data;
}

export async function deleteClasse(id: string): Promise<void> {
  await apiClient.delete(`/classes/${id}`);
}

export interface CreateNiveauInput {
  nom: string;
  cycle?: string;
  ordre?: number;
}

export interface UpdateNiveauInput {
  nom?: string;
  cycle?: string;
  ordre?: number;
}

export async function fetchNiveaux(): Promise<Niveau[]> {
  const { data } = await apiClient.get('/niveaux');
  return data;
}

export async function createNiveau(input: CreateNiveauInput): Promise<Niveau> {
  const { data } = await apiClient.post('/niveaux', input);
  return data;
}

export async function updateNiveau(id: string, input: UpdateNiveauInput): Promise<Niveau> {
  const { data } = await apiClient.patch(`/niveaux/${id}`, input);
  return data;
}

export async function deleteNiveau(id: string): Promise<void> {
  await apiClient.delete(`/niveaux/${id}`);
}

export async function fetchAnneesScolaires(): Promise<AnneeScolaire[]> {
  const { data } = await apiClient.get('/annees-scolaires');
  return data;
}

export async function createAnneeScolaire(input: CreateAnneeScolaireInput): Promise<AnneeScolaire> {
  const { data } = await apiClient.post('/annees-scolaires', input);
  return data;
}

export async function activerAnneeScolaire(id: string): Promise<AnneeScolaire> {
  const { data } = await apiClient.patch(`/annees-scolaires/${id}/activer`);
  return data;
}
