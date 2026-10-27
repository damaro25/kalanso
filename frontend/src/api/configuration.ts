import { apiClient } from './client';
import type { Regime } from './finances';

export interface EcoleConfiguration {
  id: string;
  nom: string;
  sigle: string | null;
  ville: string | null;
  telephone: string | null;
  email: string | null;
  nomDirecteur: string | null; // signataires du bordereau journalier
  nomComptable: string | null;
  numeroRecuDepart: number | null; // premier N° de reçu (pour continuer le carnet papier)
  // Cartes de retrait (maternelle) : vide = valeur par défaut
  carteRetraitMinistere: string | null;
  carteRetraitDev: string | null;
  carteRetraitDce: string | null;
  carteRetraitSignataire: string | null;
}

export type UpdateEcoleInput = Partial<Omit<EcoleConfiguration, 'id'>>;

// TOUS : tranche facturée quel que soit le régime de l'élève (ex. crèche/garderie).
export type GrilleRegime = Regime | 'TOUS';

// Montant des trois tranches ; null : pas de tranche.
export type Tranches = [number | null, number | null, number | null];

export interface GrilleNiveau {
  niveauId: string;
  nom: string;
  cycle: string | null;
  fraisInscription: number | null;
  fraisReinscription: number | null;
  tarifs: Partial<Record<GrilleRegime, Tranches>>;
}

export interface Grille {
  anneeScolaireId: string;
  echeances: (string | null)[];
  niveaux: GrilleNiveau[];
}

export async function fetchEcoleConfiguration(): Promise<EcoleConfiguration> {
  const { data } = await apiClient.get('/configuration/ecole');
  return data;
}

export async function updateEcoleConfiguration(input: UpdateEcoleInput): Promise<EcoleConfiguration> {
  const { data } = await apiClient.patch('/configuration/ecole', input);
  return data;
}

export async function fetchGrille(anneeScolaireId: string): Promise<Grille> {
  const { data } = await apiClient.get(`/configuration/grille/${anneeScolaireId}`);
  return data;
}

export async function enregistrerGrille(grille: Grille): Promise<Grille> {
  const { data } = await apiClient.put(`/configuration/grille/${grille.anneeScolaireId}`, {
    echeances: grille.echeances,
    niveaux: grille.niveaux.map(({ niveauId, fraisInscription, fraisReinscription, tarifs }) => ({
      niveauId,
      fraisInscription,
      fraisReinscription,
      tarifs,
    })),
  });
  return data;
}

export async function chargerModeleMameTa(): Promise<Grille> {
  const { data } = await apiClient.post('/configuration/modele-mame-ta');
  return data;
}

// --- Grille tarifaire en Excel : export, aperçu de l'import, import ---

export interface ApercuImportGrille {
  anneeScolaire: string;
  echeances: { changements: string[]; erreurs: string[] };
  lignes: { ligne: number; niveau: string; action: 'CREE' | 'MODIFIE' | 'INCHANGE' | 'ERREUR'; changements: string[]; erreurs: string[] }[];
  niveauxAbsents: string[];
  niveauxACreer: string[];
  aModifier: number;
  enErreur: number;
}

function formulaireFichier(fichier: File) {
  const formData = new FormData();
  formData.append('fichier', fichier);
  return formData;
}

export async function telechargerGrille(anneeScolaireId: string, nomFichier = 'grille-tarifaire.xlsx') {
  const { data } = await apiClient.get(`/configuration/grille/${anneeScolaireId}/export.xlsx`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([data]));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = nomFichier;
  lien.click();
  window.URL.revokeObjectURL(url);
}

export async function apercuImportGrille(anneeScolaireId: string, fichier: File): Promise<ApercuImportGrille> {
  const { data } = await apiClient.post(`/configuration/grille/${anneeScolaireId}/import/apercu`, formulaireFichier(fichier), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function importerGrille(
  anneeScolaireId: string,
  fichier: File,
): Promise<{ niveauxModifies: number; niveauxCrees: string[]; echeancesModifiees: number; grille: Grille }> {
  const { data } = await apiClient.post(`/configuration/grille/${anneeScolaireId}/import`, formulaireFichier(fichier), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

// --- Logo de l'école ---

export async function envoyerLogo(fichier: File) {
  await apiClient.post('/configuration/ecole/logo', formulaireFichier(fichier), { headers: { 'Content-Type': 'multipart/form-data' } });
}

export async function retirerLogo() {
  await apiClient.delete('/configuration/ecole/logo');
}

// --- Coordonnées de l'école en Excel ---

export interface ApercuImportEcole {
  changements: { champ: string; avant: string; apres: string }[];
  erreurs: string[];
  champsIgnores: string[];
}

export async function telechargerCoordonnees() {
  const { data } = await apiClient.get('/configuration/ecole/export.xlsx', { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([data]));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = 'coordonnees-ecole.xlsx';
  lien.click();
  window.URL.revokeObjectURL(url);
}

export async function apercuImportCoordonnees(fichier: File): Promise<ApercuImportEcole> {
  const { data } = await apiClient.post('/configuration/ecole/import/apercu', formulaireFichier(fichier), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function importerCoordonnees(fichier: File): Promise<{ modifies: number; ecole: EcoleConfiguration }> {
  const { data } = await apiClient.post('/configuration/ecole/import', formulaireFichier(fichier), {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
