// Adresse de l'API. Avec VITE_API_URL=http://localhost:3000 (développement), une page ouverte depuis un autre
// appareil du réseau local (http://192.168.1.67:5173) appellerait son propre « localhost » : on remplace donc
// localhost par l'adresse par laquelle la page a été ouverte. Une adresse de production (https://ecole.../api)
// est utilisée telle quelle. Sans VITE_API_URL : même machine que la page, port 3000.
export function calculerUrlApi(brute: string | undefined, page: Pick<Location, 'protocol' | 'hostname' | 'origin'>): string {
  const defaut = `${page.protocol}//${page.hostname}:3000`;
  if (!brute) return defaut;
  try {
    const url = new URL(brute, page.origin);
    const locale = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
    if (locale && page.hostname !== url.hostname) url.hostname = page.hostname;
    return url.toString().replace(/\/$/, '');
  } catch {
    return brute;
  }
}

export const URL_API = calculerUrlApi(import.meta.env.VITE_API_URL, window.location);
