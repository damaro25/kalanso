import { apiClient } from './client';

export interface Eleve {
  id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  genre: 'M' | 'F';
  dateNaissance: string | null;
  lieuNaissance: string | null;
  adresse: string | null;
}

export async function fetchEleves(): Promise<Eleve[]> {
  const { data } = await apiClient.get('/eleves');
  return data;
}

export async function fetchEleveFiche(id: string) {
  const { data } = await apiClient.get(`/eleves/${id}/fiche`);
  return data;
}

export async function inscrireEleve(eleveId: string, classeId: string) {
  const { data } = await apiClient.post('/inscriptions', { eleveId, classeId });
  return data;
}
