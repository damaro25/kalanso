import { apiClient } from './client';
import type { Role } from '../lib/roles';

export interface Utilisateur {
  id: string;
  nom: string;
  prenom: string;
  email: string;
  role: Role;
  actif: boolean;
  createdAt: string;
}

export interface CreateUtilisateurInput {
  nom: string;
  prenom: string;
  email: string;
  password: string;
  role: Role;
}

export interface UpdateUtilisateurInput {
  nom?: string;
  prenom?: string;
  email?: string;
  role?: Role;
  actif?: boolean;
  password?: string;
}

export async function fetchUtilisateurs(): Promise<Utilisateur[]> {
  const { data } = await apiClient.get('/utilisateurs');
  return data;
}

export async function createUtilisateur(input: CreateUtilisateurInput): Promise<Utilisateur> {
  const { data } = await apiClient.post('/utilisateurs', input);
  return data;
}

export async function updateUtilisateur(id: string, input: UpdateUtilisateurInput): Promise<Utilisateur> {
  const { data } = await apiClient.patch(`/utilisateurs/${id}`, input);
  return data;
}
