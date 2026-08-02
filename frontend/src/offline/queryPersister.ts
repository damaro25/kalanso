import { get, set, del, createStore } from 'idb-keyval';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

// Nom de base distinct de celui utilisé par Dexie (offline/db.ts) : deux
// bibliothèques différentes ne doivent jamais gérer la même base IndexedDB,
// chacune impose son propre schéma/versioning de façon incompatible avec l'autre.
const idbStore = createStore('kalanso-query-cache', 'query-cache');

const idbStorage = {
  getItem: (key: string) => get<string>(key, idbStore),
  setItem: (key: string, value: string) => set(key, value, idbStore),
  removeItem: (key: string) => del(key, idbStore),
};

export const queryPersister = createAsyncStoragePersister({
  storage: idbStorage,
  key: 'kalanso-query-cache',
});

// À incrémenter quand une évolution de DTO/forme de donnée rendrait un cache
// persistant plus ancien incompatible (invalide le cache existant au prochain
// chargement plutôt que de risquer d'afficher une donnée dans un format obsolète).
export const QUERY_CACHE_BUSTER = 'kalanso-offline-v2';
