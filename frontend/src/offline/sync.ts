import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { offlineDb } from './db';
import { connectivityStore } from './connectivityStore';
import { getQueryClient } from './queryClientRef';

let flushing = false;

function extractMessage(data: unknown): string {
  const message = (data as { message?: unknown } | undefined)?.message;
  if (Array.isArray(message)) return message.join(', ');
  if (typeof message === 'string') return message;
  return 'Erreur du serveur';
}

// Rejoue les actions en attente, dans l'ordre où elles ont été créées, comme de
// vrais appels HTTP contre les endpoints existants — aucune fusion/résolution de
// conflit personnalisée : c'est la validation métier du serveur qui tranche.
export async function flushOutbox(queryClient: QueryClient) {
  if (flushing || !connectivityStore.getSnapshot()) return;
  flushing = true;
  try {
    const pending = await offlineDb.outbox.where('status').equals('pending').sortBy('createdAt');
    const keysToInvalidate: unknown[][] = [];

    for (const entry of pending) {
      await offlineDb.outbox.update(entry.id, { status: 'syncing' });
      try {
        await apiClient.request({ method: entry.method, url: entry.url, data: entry.body });
        await offlineDb.outbox.delete(entry.id);
        keysToInvalidate.push(...entry.relatedQueryKeys);
      } catch (error: unknown) {
        const axiosError = error as { response?: { data?: unknown } };
        if (axiosError.response) {
          // Rejet métier (ex. "cette demande a déjà été traitée") : on garde une
          // trace pour résolution manuelle et on continue avec le reste de la file.
          await offlineDb.outbox.update(entry.id, {
            status: 'failed',
            lastError: extractMessage(axiosError.response.data),
            attempts: entry.attempts + 1,
          });
          continue;
        }
        // Coupure réseau en cours de rejeu : on s'arrête, le reste reste "pending"
        // pour la prochaine tentative (prochain retour de connexion).
        await offlineDb.outbox.update(entry.id, { status: 'pending' });
        break;
      }
    }

    for (const key of keysToInvalidate) {
      queryClient.invalidateQueries({ queryKey: key });
    }
  } finally {
    flushing = false;
  }
}

export function initSync() {
  const queryClient = getQueryClient();
  connectivityStore.subscribe(() => {
    if (connectivityStore.getSnapshot()) {
      flushOutbox(queryClient);
    }
  });
  if (connectivityStore.getSnapshot()) {
    flushOutbox(queryClient);
  }
}
