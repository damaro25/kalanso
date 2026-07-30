import { apiClient } from '../api/client';

type Listener = () => void;

// Ne pas se fier à navigator.onLine seul : il ne reflète que l'état de
// l'interface réseau du système, pas une vraie capacité à joindre le serveur
// (un routeur connecté sans accès internet reste "online" pour le navigateur).
// La sonde active vers l'API est la seule source de vérité.
let isOnline = navigator.onLine;
const listeners = new Set<Listener>();
let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;

function setOnline(value: boolean) {
  if (value !== isOnline) {
    isOnline = value;
    listeners.forEach((listener) => listener());
  }
}

async function probe() {
  try {
    // Endpoint public le plus léger de l'API (pas de requête base de données) :
    // sert uniquement à vérifier que le serveur est joignable.
    await apiClient.get('/', { timeout: 4000 });
    setOnline(true);
  } catch {
    setOnline(false);
  }
}

export const connectivityStore = {
  start() {
    if (started) return;
    started = true;
    window.addEventListener('online', probe);
    window.addEventListener('offline', () => setOnline(false));
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') probe();
    });
    intervalId = setInterval(probe, 20000);
    probe();
  },
  stop() {
    if (intervalId) clearInterval(intervalId);
    intervalId = null;
    started = false;
  },
  subscribe(listener: Listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  getSnapshot(): boolean {
    return isOnline;
  },
  probeNow: probe,
};
