import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { MantineProvider } from '@mantine/core';
import { Notifications, notifications } from '@mantine/notifications';
import { ModalsProvider } from '@mantine/modals';
import { registerSW } from 'virtual:pwa-register';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import App from './App.tsx';
import { theme } from './theme';
import { setQueryClient } from './offline/queryClientRef';
import { queryPersister, QUERY_CACHE_BUSTER } from './offline/queryPersister';
import { connectivityStore } from './offline/connectivityStore';
import { initSync } from './offline/sync';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      // Doit être >= au maxAge du persister ci-dessous, sinon React Query purge
      // une donnée avant même qu'elle ait pu être persistée pour l'usage hors-ligne.
      gcTime: 1000 * 60 * 60 * 24,
    },
  },
});

setQueryClient(queryClient);
connectivityStore.start();
initSync();

const updateSW = registerSW({
  onNeedRefresh() {
    notifications.show({
      title: 'Nouvelle version disponible',
      message: 'Actualisez la page pour appliquer la mise à jour de Kalanso.',
      color: 'kalanso',
      autoClose: false,
      onClick: () => updateSW(true),
    });
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MantineProvider theme={theme}>
      <Notifications />
      <ModalsProvider labels={{ confirm: 'Confirmer', cancel: 'Annuler' }}>
        <PersistQueryClientProvider
          client={queryClient}
          persistOptions={{
            persister: queryPersister,
            maxAge: 1000 * 60 * 60 * 24,
            buster: QUERY_CACHE_BUSTER,
            dehydrateOptions: { shouldDehydrateMutation: () => false },
          }}
        >
          <App />
        </PersistQueryClientProvider>
      </ModalsProvider>
    </MantineProvider>
  </StrictMode>,
);
