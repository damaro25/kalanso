// Champs liste (Regime[], Decimal[]) : tableaux natifs sous PostgreSQL, colonne JSON sous SQLite (version bureau,
// qui ne connaît pas les listes). Dans les deux cas la valeur lue est un tableau ; ce helper l'affirme au typage.
export function liste<T>(valeur: unknown): T[] {
  if (Array.isArray(valeur)) return valeur as T[];
  if (typeof valeur === 'string') {
    try {
      const v: unknown = JSON.parse(valeur);
      return Array.isArray(v) ? (v as T[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}
