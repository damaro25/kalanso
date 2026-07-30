import { useLiveQuery } from 'dexie-react-hooks';
import { offlineDb } from './db';
import type { OutboxEntry, OutboxMethod } from './types';

export async function enqueue(entry: {
  id: string;
  method: OutboxMethod;
  url: string;
  body: unknown;
  entityType: string;
  relatedQueryKeys: unknown[][];
}) {
  const record: OutboxEntry = {
    ...entry,
    status: 'pending',
    attempts: 0,
    createdAt: Date.now(),
  };
  await offlineDb.outbox.put(record);
  return record;
}

// Existe encore dans l'outbox (pending/syncing/failed) = pas encore confirmé
// par le serveur. Une fois synchronisée, une entrée est supprimée (voir sync.ts).
export async function hasOutboxEntry(id: string) {
  const entry = await offlineDb.outbox.get(id);
  return entry !== undefined;
}

export async function retryFailed(id: string) {
  await offlineDb.outbox.update(id, { status: 'pending' });
}

export async function discardFailed(id: string) {
  await offlineDb.outbox.delete(id);
}

export function useOutboxCounts() {
  const counts = useLiveQuery(
    async () => {
      const all = await offlineDb.outbox.toArray();
      return {
        pending: all.filter((e) => e.status === 'pending' || e.status === 'syncing').length,
        failed: all.filter((e) => e.status === 'failed').length,
      };
    },
    [],
    { pending: 0, failed: 0 },
  );
  return counts ?? { pending: 0, failed: 0 };
}

export function useFailedEntries(): OutboxEntry[] {
  const entries = useLiveQuery(
    () => offlineDb.outbox.where('status').equals('failed').reverse().sortBy('createdAt'),
    [],
    [],
  );
  return entries ?? [];
}

export function usePendingIds(): Set<string> {
  const ids = useLiveQuery(
    async () => {
      const all = await offlineDb.outbox.toArray();
      return new Set(all.map((e) => e.id));
    },
    [],
    new Set<string>(),
  );
  return ids ?? new Set<string>();
}
