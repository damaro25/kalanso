import { apiClient } from './client';

export type TypePersonnel = 'ENSEIGNANT' | 'ADMINISTRATIF';

export interface Personnel {
  id: string;
  nom: string;
  prenom: string;
  fonction: string;
  type: TypePersonnel;
  telephone: string | null;
  email: string | null;
  matricule: string | null;
  salaireBase: string | null;
}

export interface CreatePersonnelInput {
  nom: string;
  prenom: string;
  fonction: string;
  type?: TypePersonnel;
  telephone?: string;
  email?: string;
  matricule?: string;
  salaireBase?: number;
}

export interface UpdatePersonnelInput {
  nom?: string;
  prenom?: string;
  fonction?: string;
  type?: TypePersonnel;
  telephone?: string;
  email?: string;
  salaireBase?: number;
}

export interface LigneSalaire {
  classeId: string;
  matiereId: string;
  classe: string;
  niveau: string;
  matiere: string;
  heuresParMois: number;
  tauxHoraire: number;
  montant: number;
}

export interface SalaireEnseignant {
  personnelId: string;
  type: TypePersonnel;
  nombreClasses: number;
  totalHeures: number;
  salaireBase: number;
  lignes: LigneSalaire[];
}

export async function fetchPersonnel(): Promise<Personnel[]> {
  const { data } = await apiClient.get('/personnel');
  return data;
}

export async function fetchPersonnelDetail(id: string) {
  const { data } = await apiClient.get(`/personnel/${id}`);
  return data;
}

export async function createPersonnel(input: CreatePersonnelInput): Promise<Personnel> {
  const { data } = await apiClient.post('/personnel', input);
  return data;
}

export async function updatePersonnel(id: string, input: UpdatePersonnelInput): Promise<Personnel> {
  const { data } = await apiClient.patch(`/personnel/${id}`, input);
  return data;
}

export async function deletePersonnel(id: string): Promise<void> {
  await apiClient.delete(`/personnel/${id}`);
}

export async function fetchSalaireEnseignant(personnelId: string): Promise<SalaireEnseignant> {
  const { data } = await apiClient.get(`/personnel/${personnelId}/salaire`);
  return data;
}
