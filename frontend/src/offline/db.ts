import Dexie, { type Table } from 'dexie';
import type { OutboxEntry } from './types';

class KalansoOfflineDb extends Dexie {
  outbox!: Table<OutboxEntry, string>;

  constructor() {
    super('kalanso-offline-outbox');
    this.version(1).stores({
      outbox: 'id, status, createdAt',
    });
  }
}

export const offlineDb = new KalansoOfflineDb();
