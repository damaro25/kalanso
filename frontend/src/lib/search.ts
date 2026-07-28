// Comparaison insensible à la casse et aux accents, pour que "eleve" trouve "élève".
function normaliser(texte: string): string {
  return texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export function correspond(champs: Array<string | null | undefined>, recherche: string): boolean {
  const termes = normaliser(recherche).trim();
  if (!termes) return true;
  const texte = normaliser(champs.filter(Boolean).join(' '));
  return texte.includes(termes);
}
