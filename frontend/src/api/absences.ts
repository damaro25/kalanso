import { apiClient } from './client';
import { offlineMutation } from '../offline/offlineMutation';

export type StatutAbsence = 'PRESENT' | 'ABSENT' | 'RETARD';

export interface Absence {
  id: string;
  eleveId: string;
  date: string;
  statut: StatutAbsence;
  motif: string | null;
  eleve: { id: string; nom: string; prenom: string };
}

export interface AppelEntry {
  eleveId: string;
  statut: StatutAbsence;
  motif?: string;
}

interface EnregistrerAppelBody {
  classeId: string;
  date: string;
  entries: AppelEntry[];
}

export async function fetchAbsences(classeId: string, date: string): Promise<Absence[]> {
  const { data } = await apiClient.get('/absences', { params: { classeId, date } });
  return data;
}

// Rejouable sans risque côté serveur (absences.service.ts fait un upsert sur
// élève+date) : pas besoin de garde-fou d'idempotence pour ce module.
export async function enregistrerAppel(classeId: string, date: string, entries: AppelEntry[]) {
  return offlineMutation<EnregistrerAppelBody, Absence[]>({
    method: 'POST',
    url: '/absences/appel',
    body: { classeId, date, entries },
    entityType: 'Appel du jour',
    invalidateKeys: [['absences', classeId, date]],
    applyOptimistic: (queryClient, body) => {
      const eleves =
        queryClient.getQueryData<{ id: string; nom: string; prenom: string }[]>(['classe-eleves', body.classeId]) ?? [];
      const eleveParId = new Map(eleves.map((e) => [e.id, e]));
      const synthetique: Absence[] = body.entries.map((entry) => {
        const eleve = eleveParId.get(entry.eleveId);
        return {
          id: crypto.randomUUID(),
          eleveId: entry.eleveId,
          date: body.date,
          statut: entry.statut,
          motif: entry.motif ?? null,
          eleve: eleve ? { id: eleve.id, nom: eleve.nom, prenom: eleve.prenom } : { id: entry.eleveId, nom: '', prenom: '' },
        };
      });
      queryClient.setQueryData(['absences', body.classeId, body.date], synthetique);
    },
  });
}

export async function fetchAbsencesEleve(eleveId: string) {
  const { data } = await apiClient.get(`/absences/eleve/${eleveId}`);
  return data;
}

export async function telechargerAppelXlsx(classeId: string, date: string) {
  const response = await apiClient.get('/reporting/export/appel.xlsx', {
    params: { classeId, date },
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `appel-${classeId}-${date}.xlsx`;
  link.click();
}
