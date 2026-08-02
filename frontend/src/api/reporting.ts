import { apiClient } from './client';

export interface DashboardData {
  anneeScolaire: { id: string; libelle: string };
  totalEleves: number;
  totalPersonnel: number;
  fraisInscription: { encaisse: number };
  impayes: { nombre: number; montant: number };
  absencesAujourdhui: { absents: number; retards: number; presents: number };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await apiClient.get('/reporting/dashboard');
  return data;
}

export async function telechargerExportEleves(classeId?: string) {
  const response = await apiClient.get('/reporting/export/eleves.xlsx', {
    params: classeId ? { classeId } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'eleves.xlsx';
  link.click();
}

export async function telechargerExportImpayes() {
  const response = await apiClient.get('/reporting/export/impayes.xlsx', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'impayes.xlsx';
  link.click();
}
