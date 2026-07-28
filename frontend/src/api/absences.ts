import { apiClient } from './client';

export type StatutAbsence = 'PRESENT' | 'ABSENT' | 'RETARD';

export interface Absence {
  id: string;
  eleveId: string;
  date: string;
  statut: StatutAbsence;
  motif: string | null;
  eleve: { id: string; nom: string; prenom: string };
}

export interface AppelEntry {
  eleveId: string;
  statut: StatutAbsence;
  motif?: string;
}

export async function fetchAbsences(classeId: string, date: string): Promise<Absence[]> {
  const { data } = await apiClient.get('/absences', { params: { classeId, date } });
  return data;
}

export async function enregistrerAppel(classeId: string, date: string, entries: AppelEntry[]) {
  const { data } = await apiClient.post('/absences/appel', { classeId, date, entries });
  return data;
}

export async function fetchAbsencesEleve(eleveId: string) {
  const { data } = await apiClient.get(`/absences/eleve/${eleveId}`);
  return data;
}

export async function telechargerAppelXlsx(classeId: string, date: string) {
  const response = await apiClient.get('/reporting/export/appel.xlsx', {
    params: { classeId, date },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `appel-${classeId}-${date}.xlsx`;
  link.click();
}
