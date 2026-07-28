import axios from 'axios';
import { apiClient } from './client';

// Instance sans intercepteur d'auth : les endpoints publics ne doivent pas
// rediriger un parent non connecté vers /login.
const publicClient = axios.create({ baseURL: import.meta.env.VITE_API_URL });

export type StatutDemande = 'EN_ATTENTE' | 'ACCEPTEE' | 'REFUSEE';

export type TypeDocument = 'PHOTO' | 'ATTESTATION' | 'RELEVE_NOTES' | 'EXTRAIT_NAISSANCE' | 'AUTRE';
export type StatutDocument = 'EN_ATTENTE' | 'VERIFIE' | 'REJETE';

export const TYPES_DOCUMENT: { value: TypeDocument; label: string }[] = [
  { value: 'PHOTO', label: 'Photo' },
  { value: 'RELEVE_NOTES', label: 'Relevé de notes' },
  { value: 'EXTRAIT_NAISSANCE', label: 'Extrait de naissance' },
  { value: 'ATTESTATION', label: 'Attestation' },
  { value: 'AUTRE', label: 'Autre' },
];

export interface DocumentDemande {
  id: string;
  type: TypeDocument;
  nomFichier: string;
  mimeType: string;
  tailleOctets: number;
  statut: StatutDocument;
  commentaire: string | null;
  createdAt: string;
}

export interface EcolePublique {
  id: string;
  nom: string;
  ville: string | null;
  niveaux: { id: string; nom: string }[];
}

export interface DemandeInscription {
  id: string;
  nomEleve: string;
  prenomEleve: string;
  genre: 'M' | 'F';
  dateNaissance: string | null;
  lieuNaissance: string | null;
  niveauSouhaite: string | null;
  niveau: { id: string; nom: string } | null;
  nomParent: string;
  prenomParent: string;
  telephoneParent: string;
  emailParent: string | null;
  piecesJointes: string | null;
  statut: StatutDemande;
  motifRefus: string | null;
  eleveId: string | null;
  createdAt: string;
  documents: DocumentDemande[];
}

export interface CreateDemandeInput {
  ecoleId: string;
  nomEleve: string;
  prenomEleve: string;
  genre: 'M' | 'F';
  dateNaissance?: string;
  lieuNaissance?: string;
  niveauId?: string;
  niveauSouhaite?: string;
  nomParent: string;
  prenomParent: string;
  telephoneParent: string;
  emailParent?: string;
  piecesJointes?: string;
}

// ---- Public ----
export async function fetchEcolePublique(ecoleId: string): Promise<EcolePublique> {
  const { data } = await publicClient.get(`/admissions/ecole/${ecoleId}`);
  return data;
}

export async function soumettreDemande(input: CreateDemandeInput): Promise<DemandeInscription> {
  const { data } = await publicClient.post('/admissions', input);
  return data;
}

// Public : le parent joint un document à sa demande.
export async function uploaderDocument(demandeId: string, type: TypeDocument, fichier: File): Promise<DocumentDemande> {
  const form = new FormData();
  form.append('type', type);
  form.append('fichier', fichier);
  const { data } = await publicClient.post(`/admissions/${demandeId}/documents`, form);
  return data;
}

// ---- Direction ----
export function urlTelechargementDocument(documentId: string): string {
  return `${import.meta.env.VITE_API_URL}/admissions/documents/${documentId}/telecharger`;
}

// Aperçu dans un nouvel onglet (images, PDF...). Le blob conserve son type MIME.
export async function ouvrirDocument(documentId: string, mimeType?: string) {
  const { data } = await apiClient.get(`/admissions/documents/${documentId}/telecharger`, { responseType: 'blob' });
  const blob = mimeType ? new Blob([data], { type: mimeType }) : data;
  const url = window.URL.createObjectURL(blob);
  window.open(url, '_blank');
}

// Téléchargement du fichier avec son nom d'origine (fonctionne pour tous les formats).
export async function telechargerDocument(documentId: string, nomFichier: string) {
  const { data } = await apiClient.get(`/admissions/documents/${documentId}/telecharger`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = nomFichier;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function verifierDocument(documentId: string, statut: 'VERIFIE' | 'REJETE', commentaire?: string) {
  const { data } = await apiClient.post(`/admissions/documents/${documentId}/verifier`, { statut, commentaire });
  return data;
}

// ---- Direction ----
export async function fetchDemandes(statut?: StatutDemande): Promise<DemandeInscription[]> {
  const { data } = await apiClient.get('/admissions', { params: statut ? { statut } : {} });
  return data;
}

export async function accepterDemande(id: string, payload: { classeId: string; matricule?: string }) {
  const { data } = await apiClient.post(`/admissions/${id}/accepter`, payload);
  return data;
}

export async function refuserDemande(id: string, motifRefus?: string) {
  const { data } = await apiClient.post(`/admissions/${id}/refuser`, { motifRefus });
  return data;
}

// Annule une admission acceptée : supprime définitivement l'élève et tout ce
// qui en dépend (factures, notes, absences...), remet la demande en attente.
export async function annulerAdmission(id: string) {
  const { data } = await apiClient.post(`/admissions/${id}/annuler`);
  return data;
}

// Annule un refus : remet la demande en attente, sans perte de données.
export async function annulerRefus(id: string) {
  const { data } = await apiClient.post(`/admissions/${id}/annuler-refus`);
  return data;
}

export type TypeAnnulation = 'ADMISSION' | 'REFUS';

export interface HistoriqueAnnulation {
  id: string;
  demandeId: string;
  type: TypeAnnulation;
  nomEleve: string;
  prenomEleve: string;
  detail: string | null;
  annuleeParId: string | null;
  createdAt: string;
}

export async function fetchHistoriqueAnnulations(): Promise<HistoriqueAnnulation[]> {
  const { data } = await apiClient.get('/admissions/historique-annulations');
  return data;
}

export interface InscriptionDirecteInput {
  nomEleve: string;
  prenomEleve: string;
  genre: 'M' | 'F';
  dateNaissance?: string;
  lieuNaissance?: string;
  niveauSouhaite?: string;
  nomParent: string;
  prenomParent: string;
  telephoneParent: string;
  emailParent?: string;
}

// Secrétariat : élève reçu directement au bureau. Crée une demande EN_ATTENTE,
// exactement comme le formulaire public — l'élève n'est créé qu'à l'acceptation.
export async function inscrireSurPlace(input: InscriptionDirecteInput): Promise<DemandeInscription> {
  const { data } = await apiClient.post('/admissions/inscription-directe', input);
  return data;
}
