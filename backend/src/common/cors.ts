// CORS : le navigateur n'accepte les réponses de l'API que pour les pages ouvertes depuis cette machine ou le
// réseau local (adresses privées 10.x, 172.16-31.x, 192.168.x), plus les origines listées dans CORS_ORIGINS
// (séparées par des virgules). En production, frontend et API sont sur le même domaine : rien à ajouter.
const RESEAU_LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/;
const ORIGINES_SUPPLEMENTAIRES = (process.env.CORS_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
export function origineAutorisee(origine: string | undefined, rappel: (erreur: Error | null, ok?: boolean) => void) {
  // Pas d'en-tête Origin : appel non navigateur (curl, même origine) : rien à contrôler
  rappel(null, !origine || RESEAU_LOCAL.test(origine) || ORIGINES_SUPPLEMENTAIRES.includes(origine));
}
