export type OutboxMethod = 'POST' | 'PATCH' | 'DELETE';
export type OutboxStatus = 'pending' | 'syncing' | 'failed';

export interface OutboxEntry {
  id: string;
  method: OutboxMethod;
  url: string;
  body: unknown;
  entityType: string;
  // Clés React Query à invalider une fois cette entrée synchronisée avec succès.
  relatedQueryKeys: unknown[][];
  status: OutboxStatus;
  attempts: number;
  lastError?: string;
  createdAt: number;
}
