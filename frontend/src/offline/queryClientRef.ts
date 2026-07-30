import type { QueryClient } from '@tanstack/react-query';

// L'appli n'a qu'un seul QueryClient (créé une fois dans main.tsx). Les fichiers
// api/*.ts sont de simples fonctions en dehors de l'arbre React et n'ont pas accès
// à useQueryClient() — cette référence leur permet de patcher le cache (écriture
// optimiste hors-ligne) sans changer la signature de chaque fonction ni forcer les
// pages appelantes à passer le queryClient explicitement.
let client: QueryClient | null = null;

export function setQueryClient(qc: QueryClient) {
  client = qc;
}

export function getQueryClient(): QueryClient {
  if (!client) {
    throw new Error('QueryClient non initialisé — setQueryClient() doit être appelé au démarrage.');
  }
  return client;
}
