import { apiClient } from './client';

export type TypeMessage = 'MANUEL' | 'ABSENCE' | 'RAPPEL_IMPAYE';
export type StatutMessage = 'EN_ATTENTE' | 'ENVOYE' | 'ECHEC';

export interface MessageParent {
  id: string;
  telephone: string;
  contenu: string;
  type: TypeMessage;
  statut: StatutMessage;
  createdAt: string;
  eleve: { id: string; nom: string; prenom: string } | null;
  parentTuteur: { id: string; nom: string; prenom: string } | null;
}

export async function fetchMessages(): Promise<MessageParent[]> {
  const { data } = await apiClient.get('/communication/messages');
  return data;
}

export async function envoyerMessage(input: { contenu: string; eleveId?: string; classeId?: string }) {
  const { data } = await apiClient.post('/communication/messages', input);
  return data;
}

export async function envoyerRappelImpaye(factureId: string) {
  const { data } = await apiClient.post(`/communication/rappel-impaye/${factureId}`);
  return data;
}
