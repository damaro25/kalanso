import type { QueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { connectivityStore } from './connectivityStore';
import { getQueryClient } from './queryClientRef';
import { enqueue } from './outbox';
import type { OutboxMethod } from './types';

interface OfflineMutationInput<TBody> {
  method: OutboxMethod;
  url: string;
  body: TBody;
  entityType: string;
  // Patch immédiat du cache React Query pour que l'UI reflète l'action avant
  // même sa synchronisation — reçoit l'id généré côté client pour les créations.
  applyOptimistic?: (queryClient: QueryClient, body: TBody, id: string) => void;
  invalidateKeys?: unknown[][];
}

// Point d'entrée générique réutilisé par chaque fonction mutante de api/*.ts.
// En ligne : comportement strictement identique à un appel apiClient direct.
// Hors ligne (ou coupure réseau détectée en cours de route) : la requête est
// mise en file d'attente et rejouée plus tard (voir sync.ts) ; l'appelant reçoit
// une réponse synthétique pour ne pas avoir à distinguer les deux cas.
export async function offlineMutation<TBody, TResult = unknown>({
  method,
  url,
  body,
  entityType,
  applyOptimistic,
  invalidateKeys = [],
}: OfflineMutationInput<TBody>): Promise<TResult> {
  const queryClient = getQueryClient();

  if (connectivityStore.getSnapshot()) {
    try {
      const { data } = await apiClient.request({ method, url, data: body });
      return data as TResult;
    } catch (error: unknown) {
      const axiosError = error as { response?: unknown };
      if (axiosError.response) {
        // Rejet métier explicite du serveur (validation, règle d'affaire) :
        // ce n'est pas un problème de connectivité, on laisse l'appelant gérer.
        throw error;
      }
      // Sinon : la requête a échoué sans réponse serveur malgré un état "en ligne"
      // cru côté client — on bascule sur le chemin hors-ligne ci-dessous.
    }
  }

  const outboxId = crypto.randomUUID();
  // Pour une création, l'id qui identifiera l'entité doit être le même dans le
  // corps rejoué au serveur et dans le patch optimiste local — sinon la ligne
  // créée hors-ligne ne pourrait plus être retrouvée après synchronisation.
  // Pour une modification/suppression, l'entité a déjà un id réel : on ne touche
  // pas au corps de la requête.
  const entityId = method === 'POST' ? crypto.randomUUID() : outboxId;
  const bodyToSend = method === 'POST' ? ({ ...(body as object), id: entityId } as TBody) : body;

  await enqueue({ id: outboxId, method, url, body: bodyToSend, entityType, relatedQueryKeys: invalidateKeys });
  applyOptimistic?.(queryClient, body, entityId);
  return { id: entityId, ...(body as object) } as TResult;
}
