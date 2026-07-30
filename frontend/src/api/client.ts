import axios from 'axios';

export const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
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
    if (error.response?.status === 401) {
      localStorage.removeItem('kalanso_token');
      localStorage.removeItem('kalanso_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  },
);
