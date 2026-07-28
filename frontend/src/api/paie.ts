import { apiClient } from './client';

export type StatutBulletinPaie = 'BROUILLON' | 'VALIDE' | 'PAYE';

export interface LigneBulletin {
  libelle: string;
  imposable: boolean;
  montantGain: number;
  montantRetenue: number;
}

export interface BulletinPaie {
  id: string;
  personnelId: string;
  mois: number;
  annee: number;
  nombreHeures: number | null;
  totalGains: string;
  totalRetenues: string;
  netAPayer: string;
  statut: StatutBulletinPaie;
  modePaiement: string | null;
  personnel: { id: string; nom: string; prenom: string; matricule: string | null; fonction: string };
}

export interface HeureClasse {
  classeId: string;
  matiereId: string;
  heures: number;
}

export interface CreateBulletinInput {
  personnelId: string;
  mois: number;
  annee: number;
  nombreHeures?: number;
  modePaiement?: string;
  heuresParClasse?: HeureClasse[];
  lignes?: LigneBulletin[];
}

export async function fetchBulletinsPaie(mois: number, annee: number): Promise<BulletinPaie[]> {
  const { data } = await apiClient.get('/paie/bulletins', { params: { mois, annee } });
  return data;
}

export async function createBulletinPaie(input: CreateBulletinInput): Promise<BulletinPaie> {
  const { data } = await apiClient.post('/paie/bulletins', input);
  return data;
}

export async function validerBulletinPaie(id: string) {
  const { data } = await apiClient.post(`/paie/bulletins/${id}/valider`, {});
  return data;
}

export async function supprimerBulletinPaie(id: string) {
  await apiClient.delete(`/paie/bulletins/${id}`);
}

export async function ouvrirBulletinPaiePdf(id: string) {
  const response = await apiClient.get(`/reporting/export/bulletin-paie/${id}.pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export async function telechargerCahierPaie(mois: number, annee: number) {
  const response = await apiClient.get('/reporting/export/cahier-paie.xlsx', {
    params: { mois, annee },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `cahier-paie-${mois}-${annee}.xlsx`;
  link.click();
}

export interface ImportResultat {
  creees: number;
  erreurs: { ligne: number; motif: string }[];
}

export async function importBulletinsPaie(fichier: File): Promise<ImportResultat> {
  const formData = new FormData();
  formData.append('fichier', fichier);
  const { data } = await apiClient.post('/paie/bulletins/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function telechargerModelePaie() {
  const response = await apiClient.get('/reporting/export/paie-modele.xlsx', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'modele-import-paie.xlsx';
  link.click();
}
