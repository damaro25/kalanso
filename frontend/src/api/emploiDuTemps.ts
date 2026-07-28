import { apiClient } from './client';

export type JourSemaine = 'LUNDI' | 'MARDI' | 'MERCREDI' | 'JEUDI' | 'VENDREDI' | 'SAMEDI';

export const JOURS: { value: JourSemaine; label: string }[] = [
  { value: 'LUNDI', label: 'Lundi' },
  { value: 'MARDI', label: 'Mardi' },
  { value: 'MERCREDI', label: 'Mercredi' },
  { value: 'JEUDI', label: 'Jeudi' },
  { value: 'VENDREDI', label: 'Vendredi' },
  { value: 'SAMEDI', label: 'Samedi' },
];

export interface Salle {
  id: string;
  nom: string;
  capacite: number | null;
}

export interface Creneau {
  id: string;
  jour: JourSemaine;
  heureDebut: string;
  heureFin: string;
  tauxHoraire: string | null;
  matiere: { id: string; nom: string };
  personnel: { id: string; nom: string; prenom: string } | null;
  salle: Salle | null;
}

export interface CreneauPersonnel {
  id: string;
  jour: JourSemaine;
  heureDebut: string;
  heureFin: string;
  tauxHoraire: string | null;
  matiere: { id: string; nom: string };
  classe: { id: string; nom: string };
  salle: Salle | null;
}

export interface CreateCreneauInput {
  classeId: string;
  matiereId: string;
  personnelId?: string;
  salleId?: string;
  jour: JourSemaine;
  heureDebut: string;
  heureFin: string;
  tauxHoraire?: number;
}

export async function fetchCreneaux(classeId: string): Promise<Creneau[]> {
  const { data } = await apiClient.get('/emploi-du-temps', { params: { classeId } });
  return data;
}

export async function fetchCreneauxParPersonnel(personnelId: string): Promise<CreneauPersonnel[]> {
  const { data } = await apiClient.get(`/emploi-du-temps/personnel/${personnelId}`);
  return data;
}

export async function createCreneau(input: CreateCreneauInput): Promise<Creneau> {
  const { data } = await apiClient.post('/emploi-du-temps', input);
  return data;
}

export async function deleteCreneau(id: string): Promise<void> {
  await apiClient.delete(`/emploi-du-temps/${id}`);
}

export async function fetchSalles(): Promise<Salle[]> {
  const { data } = await apiClient.get('/salles');
  return data;
}

export async function createSalle(nom: string, capacite?: number): Promise<Salle> {
  const { data } = await apiClient.post('/salles', { nom, capacite });
  return data;
}

export async function telechargerEmploiDuTempsXlsx(classeId: string) {
  const response = await apiClient.get('/reporting/export/emploi-du-temps.xlsx', {
    params: { classeId },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `emploi-du-temps-${classeId}.xlsx`;
  link.click();
}

export async function ouvrirEmploiDuTempsPdf(classeId: string) {
  const response = await apiClient.get('/reporting/export/emploi-du-temps.pdf', {
    params: { classeId },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}
