import { apiClient } from './client';

// Synchronisation version bureau ↔ serveur (réglages visibles dans la version bureau seulement)
export interface ConfigSync {
  modeBureau: boolean;
  urlServeur?: string;
  email?: string;
  motDePasseEnregistre?: boolean;
  poste?: string | null;
  actif?: boolean;
  initialise?: boolean;
  derniereSyncLe?: string | null;
  dernierEtat?: string | null;
  enAttente?: number | null;
  bdHote?: string;
  bdPort?: number | null;
  bdNom?: string;
  bdUtilisateur?: string;
  bdMotDePasseEnregistre?: boolean;
}

export async function fetchConfigSync(): Promise<ConfigSync> {
  const { data } = await apiClient.get('/sync/config');
  return data;
}

export interface ReglagesSync {
  urlServeur?: string;
  email?: string;
  motDePasse?: string;
  actif?: boolean;
  bdHote?: string;
  bdPort?: number | null;
  bdNom?: string;
  bdUtilisateur?: string;
  bdMotDePasse?: string;
}

export async function enregistrerConfigSync(input: ReglagesSync): Promise<ConfigSync> {
  const { data } = await apiClient.put('/sync/config', input);
  return data;
}

export async function testerSync(): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiClient.post('/sync/tester', null, { timeout: 90000 });
  return data;
}

export async function testerBaseSync(): Promise<{ ok: boolean; message: string }> {
  const { data } = await apiClient.post('/sync/tester-base', null, { timeout: 60000 });
  return data;
}

export async function synchroniserMaintenant(): Promise<{ envoyes: number; recus: number; rejetes: number; etat: string }> {
  const { data } = await apiClient.post('/sync/maintenant', null, { timeout: 600000 });
  return data;
}
