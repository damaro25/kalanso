import { apiClient } from './client';

export interface DashboardData {
  anneeScolaire: { id: string; libelle: string };
  totalEleves: number;
  totalPersonnel?: number; // absent pour un enseignant
  perimetre?: { nbClasses: number }; // présent pour un enseignant : nombre de ses classes
  // Absents de la réponse pour les rôles sans accès aux finances (secrétaire, enseignant).
  fraisInscription?: { encaisse: number };
  impayes?: { nombre: number; montant: number };
  ecolage?: { paye: number; facture: number; pourcentage: number }; // écolage de l'année : payé / facturé
  absencesAujourdhui: { absents: number; retards: number; presents: number };
}

export async function fetchDashboard(): Promise<DashboardData> {
  const { data } = await apiClient.get('/reporting/dashboard');
  return data;
}

export async function telechargerExportEleves(classeId?: string, regime?: string) {
  const response = await apiClient.get('/reporting/export/eleves.xlsx', {
    params: { ...(classeId ? { classeId } : {}), ...(regime ? { regime } : {}) },
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

export async function telechargerExportParcours(classeId: string) {
  const response = await apiClient.get('/reporting/export/parcours-classe.xlsx', {
    params: { classeId },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'parcours.xlsx';
  link.click();
}

// Impayés d'écolage par tranche et par classe (Excel, une feuille par classe)
export async function telechargerImpayesParTranche(filtres: { classeId?: string; tranche?: string } = {}) {
  const response = await apiClient.get('/reporting/export/impayes-tranches.xlsx', {
    params: { ...(filtres.classeId ? { classeId: filtres.classeId } : {}), ...(filtres.tranche ? { tranche: filtres.tranche } : {}) },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = filtres.tranche ? `impayes-tranche-${filtres.tranche}.xlsx` : 'impayes-par-tranche.xlsx';
  link.click();
  window.URL.revokeObjectURL(url);
}
