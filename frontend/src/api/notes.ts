import { apiClient } from './client';
import { offlineMutation } from '../offline/offlineMutation';

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

// createMatiere fait un create() brut côté serveur (pas d'upsert) : id
// pré-généré côté client + garde-fou d'idempotence dans matieres.service.ts.
export async function createMatiere(input: CreateMatiereInput): Promise<Matiere> {
  return offlineMutation<CreateMatiereInput & { id?: string }, Matiere>({
    method: 'POST',
    url: '/matieres',
    body: input,
    entityType: 'Matière',
    invalidateKeys: [['matieres', input.niveauId]],
    applyOptimistic: (queryClient, body, id) => {
      const synthetique: Matiere = {
        id,
        nom: body.nom,
        coefficient: String(body.coefficient),
        niveau: { id: body.niveauId, nom: '' },
      };
      queryClient.setQueryData<Matiere[]>(['matieres', body.niveauId], (prev) => [...(prev ?? []), synthetique]);
    },
  });
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

// Rejouable sans risque côté serveur (notes.service.ts fait un upsert sur
// élève+matière+trimestre) : pas besoin de garde-fou d'idempotence ici.
export async function saisirNotes(classeId: string, trimestre: number, entries: NoteEntry[]) {
  // La page cache les notes sous une clé où le trimestre est une chaîne
  // (état du <Select>, ex. '1') — on s'aligne dessus pour que le patch
  // optimiste et l'invalidation visent bien la même entrée de cache.
  const trimestreKey = String(trimestre);
  return offlineMutation<{ classeId: string; trimestre: number; entries: NoteEntry[] }, Note[]>({
    method: 'POST',
    url: '/notes',
    body: { classeId, trimestre, entries },
    entityType: 'Notes',
    invalidateKeys: [['notes', classeId, trimestreKey]],
    applyOptimistic: (queryClient, body) => {
      const classes = queryClient.getQueryData<{ id: string; niveau: { id: string } }[]>(['classes']) ?? [];
      const niveauId = classes.find((c) => c.id === body.classeId)?.niveau.id;
      const matieres = queryClient.getQueryData<Matiere[]>(['matieres', niveauId]) ?? [];
      const matiereParId = new Map(matieres.map((m) => [m.id, m]));
      const eleves =
        queryClient.getQueryData<{ id: string; nom: string; prenom: string }[]>(['classe-eleves', body.classeId]) ?? [];
      const eleveParId = new Map(eleves.map((e) => [e.id, e]));

      const synthetiques: Note[] = body.entries.map((entry) => {
        const eleve = eleveParId.get(entry.eleveId);
        const matiere = matiereParId.get(entry.matiereId);
        return {
          id: crypto.randomUUID(),
          eleveId: entry.eleveId,
          matiereId: entry.matiereId,
          valeur: String(entry.valeur),
          appreciation: null,
          matiere: matiere ?? { id: entry.matiereId, nom: '', coefficient: '1', niveau: { id: niveauId ?? '', nom: '' } },
          eleve: eleve ? { id: eleve.id, nom: eleve.nom, prenom: eleve.prenom } : { id: entry.eleveId, nom: '', prenom: '' },
        };
      });
      queryClient.setQueryData(['notes', body.classeId, trimestreKey], synthetiques);
    },
  });
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
