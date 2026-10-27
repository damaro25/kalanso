import { apiClient } from './client';
import type { Regime } from './finances';
import { rafraichirFinances } from './budget';

// Import / export Excel de la liste complète des élèves (identité, classe, régime, contact, père, mère).

export interface LigneApercuImport {
  ligne: number;
  action: 'CREER' | 'METTRE_A_JOUR' | 'ERREUR';
  matricule: string;
  nomComplet: string;
  classe: string;
  regime: Regime | null;
  erreurs: string[];
}

export interface ApercuImportEleves {
  lignes: LigneApercuImport[];
  aCreer: number;
  aMettreAJour: number;
  enErreur: number;
  colonnesIgnorees: string[];
  // Classes (et leurs niveaux) absentes de l'année courante, créées à l'import
  niveauxACreer: string[];
  classesACreer: string[];
}

export interface ResultatImportEleves {
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; motif: string }[];
  niveauxCrees: string[];
  classesCrees: string[];
}

function formulaire(fichier: File) {
  const formData = new FormData();
  formData.append('fichier', fichier);
  return formData;
}

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

export async function apercuImportEleves(fichier: File): Promise<ApercuImportEleves> {
  const { data } = await apiClient.post('/eleves/import/apercu', formulaire(fichier), multipart);
  return data;
}

// Un import qui inscrit des élèves crée leurs factures d'inscription et d'écolage.
export async function importerEleves(fichier: File): Promise<ResultatImportEleves> {
  const { data } = await apiClient.post('/eleves/import', formulaire(fichier), { ...multipart, timeout: 120000 });
  rafraichirFinances();
  return data;
}

function telecharger(donnees: BlobPart, nomFichier: string) {
  const url = window.URL.createObjectURL(new Blob([donnees]));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  window.URL.revokeObjectURL(url);
}

export async function telechargerModeleImportEleves() {
  const { data } = await apiClient.get('/eleves/import/modele.xlsx', { responseType: 'blob' });
  telecharger(data, 'modele-import-eleves.xlsx');
}

export async function telechargerExportElevesComplet(filtres: { classeId?: string; regime?: Regime } = {}) {
  const { data } = await apiClient.get('/eleves/export.xlsx', {
    params: { ...(filtres.classeId ? { classeId: filtres.classeId } : {}), ...(filtres.regime ? { regime: filtres.regime } : {}) },
    responseType: 'blob',
  });
  telecharger(data, 'eleves-complet.xlsx');
}
