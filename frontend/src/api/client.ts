import axios from 'axios';
import { purgerCacheUtilisateur } from '../offline/purgerCache';
import { URL_API } from './urlApi';

export const apiClient = axios.create({
  baseURL: URL_API, // localhost remplacé par l'adresse de la page (accès depuis le réseau local)
  // Nécessaire pour distinguer un rejet métier (réponse serveur reçue) d'une
  // vraie coupure réseau (requête qui reste en suspens) — c'est cette distinction
  // que le mécanisme hors-ligne (offlineMutation) utilise pour décider de mettre
  // une action en file d'attente plutôt que de la faire échouer directement.
  timeout: 8000,
});

apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('kalanso_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Un mauvais mot de passe à la connexion n'est pas une session expirée : la page de connexion affiche l'erreur.
    if (error.response?.status === 401 && !String(error.config?.url ?? '').includes('/auth/login')) {
      localStorage.removeItem('kalanso_token');
      localStorage.removeItem('kalanso_user');
      // Session expirée : on vide aussi les données en cache avant de revenir à la connexion.
      void purgerCacheUtilisateur().finally(() => {
        window.location.href = '/login';
      });
    }
    return Promise.reject(error);
  },
);
