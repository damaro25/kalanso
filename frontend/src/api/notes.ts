import { apiClient } from './client';

export interface Matiere {
  id: string;
  nom: string;
  coefficient: string;
  niveau: { id: string; nom: string };
}

export interface CreateMatiereInput {
  niveauId: string;
  nom: string;
  coefficient: number;
}

export interface Note {
  id: string;
  eleveId: string;
  matiereId: string;
  valeur: string;
  appreciation: string | null;
  matiere: Matiere;
  eleve: { id: string; nom: string; prenom: string };
}

export interface NoteEntry {
  eleveId: string;
  matiereId: string;
  valeur: number;
}

export async function fetchMatieres(niveauId?: string): Promise<Matiere[]> {
  const { data } = await apiClient.get('/matieres', { params: niveauId ? { niveauId } : {} });
  return data;
}

export async function createMatiere(input: CreateMatiereInput): Promise<Matiere> {
  const { data } = await apiClient.post('/matieres', input);
  return data;
}

export interface UpdateMatiereInput {
  nom?: string;
  coefficient?: number;
}

export async function updateMatiere(id: string, input: UpdateMatiereInput): Promise<Matiere> {
  const { data } = await apiClient.patch(`/matieres/${id}`, input);
  return data;
}

export async function deleteMatiere(id: string): Promise<void> {
  await apiClient.delete(`/matieres/${id}`);
}

export async function fetchNotes(classeId: string, trimestre: number): Promise<Note[]> {
  const { data } = await apiClient.get('/notes', { params: { classeId, trimestre } });
  return data;
}

export async function saisirNotes(classeId: string, trimestre: number, entries: NoteEntry[]) {
  const { data } = await apiClient.post('/notes', { classeId, trimestre, entries });
  return data;
}

export async function telechargerBulletin(eleveId: string, trimestre: number) {
  const response = await apiClient.get(`/reporting/export/bulletin/${eleveId}.xlsx`, {
    params: { trimestre },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bulletin-${eleveId}-T${trimestre}.xlsx`;
  link.click();
}

export async function ouvrirBulletinPdf(eleveId: string, trimestre: number) {
  const response = await apiClient.get(`/reporting/export/bulletin/${eleveId}.pdf`, {
    params: { trimestre },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export async function telechargerNotesClasse(classeId: string, trimestre: number) {
  const response = await apiClient.get('/reporting/export/notes-classe.xlsx', {
    params: { classeId, trimestre },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `notes-classe-T${trimestre}.xlsx`;
  link.click();
}
