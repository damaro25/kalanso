import { apiClient } from './client';
import type { DocumentDemande, TypeDocument } from './admissions';

// Pièces du dossier d'un élève (extrait de naissance, photo, relevés...)

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

function formulaire(type?: TypeDocument, fichier?: File) {
  const form = new FormData();
  if (type) form.append('type', type);
  if (fichier) form.append('fichier', fichier);
  return form;
}

export async function fetchDocumentsEleve(eleveId: string): Promise<DocumentDemande[]> {
  const { data } = await apiClient.get(`/eleves/${eleveId}/documents`);
  return data;
}

export async function ajouterDocumentEleve(eleveId: string, type: TypeDocument, fichier: File): Promise<DocumentDemande> {
  const { data } = await apiClient.post(`/eleves/${eleveId}/documents`, formulaire(type, fichier), multipart);
  return data;
}

// Changer le type et/ou remplacer le fichier
export async function modifierDocumentEleve(eleveId: string, documentId: string, modif: { type?: TypeDocument; fichier?: File }) {
  const { data } = await apiClient.put(`/eleves/${eleveId}/documents/${documentId}`, formulaire(modif.type, modif.fichier), multipart);
  return data as DocumentDemande;
}

export async function supprimerDocumentEleve(eleveId: string, documentId: string) {
  await apiClient.delete(`/eleves/${eleveId}/documents/${documentId}`);
}

// Ouvre la pièce dans un nouvel onglet (images, PDF...) avec son type d'origine
export async function ouvrirDocumentEleve(eleveId: string, document: DocumentDemande) {
  const { data } = await apiClient.get(`/eleves/${eleveId}/documents/${document.id}/fichier`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([data], { type: document.mimeType }));
  window.open(url, '_blank');
}
