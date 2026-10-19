import { apiClient } from './client';
import type { Regime } from './finances';

export interface Eleve {
  id: string;
  matricule: string | null;
  nom: string;
  prenom: string;
  genre: 'M' | 'F';
  dateNaissance: string | null;
  lieuNaissance: string | null;
  adresse: string | null;
  regime?: Regime | null; // celui de l'inscription en cours (liste des élèves)
  classe?: { id: string; nom: string; niveau: string } | null; // classe de l'inscription en cours (liste des élèves)
}

// Filtres facultatifs : classe et régime de l'inscription en cours.
export async function fetchEleves(filtres: { classeId?: string; regime?: Regime } = {}): Promise<Eleve[]> {
  const { data } = await apiClient.get('/eleves', {
    params: { ...(filtres.classeId ? { classeId: filtres.classeId } : {}), ...(filtres.regime ? { regime: filtres.regime } : {}) },
  });
  return data;
}

// Filiation : père et mère (null ou personne vide : le lien est retiré)
export interface PersonneFiliation {
  prenom: string;
  nom: string;
  telephone: string;
  profession: string;
}

export interface ContactPrincipal {
  prenom: string;
  nom: string;
  telephone: string;
  email: string;
  lien: string;
}

export async function modifierFiliation(
  eleveId: string,
  filiation: { pere: PersonneFiliation | null; mere: PersonneFiliation | null; contact?: ContactPrincipal },
) {
  const { data } = await apiClient.put(`/eleves/${eleveId}/filiation`, filiation);
  return data;
}

export async function fetchEleveFiche(id: string) {
  const { data } = await apiClient.get(`/eleves/${id}/fiche`);
  return data;
}

export async function inscrireEleve(eleveId: string, classeId: string, regime?: Regime) {
  const { data } = await apiClient.post('/inscriptions', { eleveId, classeId, regime });
  return data;
}

// Supprime (radie) l'élève : il disparaît des listes et son inscription en cours est close ; ses factures et
// paiements restent dans les comptes. Le code à 4 chiffres est vérifié par le serveur.
export async function supprimerEleve(eleveId: string, code: string) {
  const { data } = await apiClient.delete(`/eleves/${eleveId}`, { headers: { 'X-Code-Suppression': code } });
  return data;
}

export interface ModificationEleve {
  nom?: string;
  prenom?: string;
  genre?: 'M' | 'F';
  matricule?: string;
  dateNaissance?: string; // AAAA-MM-JJ, vide : effacée
  lieuNaissance?: string;
  adresse?: string;
}

export async function modifierEleve(eleveId: string, modification: ModificationEleve) {
  const { data } = await apiClient.patch(`/eleves/${eleveId}`, modification);
  return data;
}

export interface ApercuSuppressionEleve {
  factures: number;
  paiements: number;
  notes: number;
  absences: number;
  inscriptions: number;
  formations: number;
  emprunts: number;
  messages: number;
  demandes: number;
}

export async function fetchApercuSuppression(eleveId: string): Promise<ApercuSuppressionEleve> {
  const { data } = await apiClient.get(`/eleves/${eleveId}/suppression`);
  return data;
}
