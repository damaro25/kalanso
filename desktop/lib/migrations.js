// Applique les migrations SQLite (migrations/<nom>/migration.sql) à la base de la version bureau, dans l'ordre,
// en tenant la même table _prisma_migrations que `prisma migrate deploy`. `client` : client @libsql/client.
const { createHash, randomUUID } = require('node:crypto');
const { existsSync, readdirSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

async function appliquerMigrations(client, dossierMigrations, journal = console.log) {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
      "id" TEXT PRIMARY KEY NOT NULL,
      "checksum" TEXT NOT NULL,
      "finished_at" DATETIME,
      "migration_name" TEXT NOT NULL,
      "logs" TEXT,
      "rolled_back_at" DATETIME,
      "started_at" DATETIME NOT NULL DEFAULT current_timestamp,
      "applied_steps_count" INTEGER UNSIGNED NOT NULL DEFAULT 0
    )`);
  const { rows } = await client.execute(
    'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL',
  );
  const appliquees = new Set(rows.map((r) => r.migration_name));

  const noms = readdirSync(dossierMigrations, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dossierMigrations, d.name, 'migration.sql')))
    .map((d) => d.name)
    .sort();

  let nouvelles = 0;
  for (const nom of noms) {
    if (appliquees.has(nom)) continue;
    const sql = readFileSync(join(dossierMigrations, nom, 'migration.sql'), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const id = randomUUID();
    journal(`Migration ${nom}`);
    try {
      // Toute la migration et son enregistrement dans une seule transaction
      await client.executeMultiple(`BEGIN;
${sql}
INSERT INTO "_prisma_migrations" (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
VALUES ('${id}', '${checksum}', '${nom.replace(/'/g, "''")}', current_timestamp, current_timestamp, 1);
COMMIT;`);
      nouvelles++;
    } catch (e) {
      try {
        await client.execute('ROLLBACK');
      } catch {}
      throw new Error(`Échec de la migration ${nom} : ${e.message}`);
    }
  }
  return nouvelles;
}

module.exports = { appliquerMigrations };
