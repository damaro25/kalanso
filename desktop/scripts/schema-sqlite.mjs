// Convertit le schéma Prisma PostgreSQL du backend en schéma SQLite pour la version bureau :
//   - fournisseur sqlite ;
//   - types natifs (@db.Decimal, @db.Date…) retirés : SQLite n'en a pas ;
//   - listes de scalaires ou d'énumérations (Regime[], Decimal[]) stockées en JSON : SQLite ne connaît pas les
//     listes (le code lit ces champs avec liste(), voir backend/src/common/liste.util.ts).
const SCALAIRES = new Set(['String', 'Int', 'BigInt', 'Float', 'Decimal', 'Boolean', 'DateTime', 'Json', 'Bytes']);

export function schemaSqlite(source) {
  const enums = new Set([...source.matchAll(/^enum\s+(\w+)/gm)].map((m) => m[1]));
  return source
    .replace(/provider\s*=\s*"postgresql"/, 'provider = "sqlite"')
    .replace(/\s@db\.\w+(\([^)]*\))?/g, '')
    .replace(/^(\s+\w+\s+)(\w+)\[\](\??)/gm, (ligne, debut, type) =>
      SCALAIRES.has(type) || enums.has(type) ? `${debut}Json` : ligne,
    )
    .replace(/@default\(\[\]\)/g, '@default("[]")');
}
