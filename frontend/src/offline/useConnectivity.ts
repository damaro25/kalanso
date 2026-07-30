import { useSyncExternalStore } from 'react';
import { connectivityStore } from './connectivityStore';
import { useOutboxCounts } from './outbox';

export function useConnectivity() {
  const isOnline = useSyncExternalStore(connectivityStore.subscribe, connectivityStore.getSnapshot);
  const { pending, failed } = useOutboxCounts();
  return { isOnline, pendingCount: pending, failedCount: failed };
}
