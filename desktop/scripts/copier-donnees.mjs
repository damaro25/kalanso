// Copie les données de l'installation actuelle (base PostgreSQL de backend/.env + dossier backend/uploads) dans
// la base SQLite de la version bureau installée sur ce PC. La base PostgreSQL n'est que lue. Une base SQLite
// neuve est construite à côté, contrôlée, puis mise à la place de l'ancienne, qui est gardée (renommée).
// Prérequis : version bureau fermée. Usage (depuis desktop/, après npm run preparer) : node scripts/copier-donnees.mjs
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { cp } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

const require = createRequire(import.meta.url);
const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const racine = join(desktop, '..');
const dossierBackend = join(desktop, 'build', 'backend');
const { initialiserBase, ouvrir } = require('../lib/init-db.js');
const pg = require(require.resolve('pg', { paths: [dossierBackend] }));

const donnees = join(process.env.APPDATA, 'Mamé-TA Gestion scolaire', 'donnees');
const fichierBase = join(donnees, 'mameta.db');
const fichierNeuf = join(donnees, 'mameta-neuf.db');
const urlSqlite = `file:${fichierNeuf.replace(/\\/g, '/')}`;
const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

const portOccupe = (port) =>
  new Promise((ok) => {
    const s = net.connect(port, '127.0.0.1', () => {
      s.destroy();
      ok(true);
    });
    s.on('error', () => ok(false));
  });
if ((await portOccupe(37100)) || (await portOccupe(37101))) throw new Error('Fermez la version bureau avant de copier les données.');

// Dates PostgreSQL lues telles quelles : timestamp sans fuseau = UTC (convention Prisma), date = jour seul
pg.types.setTypeParser(1114, (s) => new Date(`${s.replace(' ', 'T')}Z`));
pg.types.setTypeParser(1082, (s) => new Date(`${s}T00:00:00.000Z`));

const env = readFileSync(join(racine, 'backend', '.env'), 'utf8');
const urlSource = /DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/.exec(env)?.[1];
if (!urlSource) throw new Error('DATABASE_URL introuvable dans backend/.env');

// 1. Base SQLite neuve (schéma et compte initial), à côté de l'actuelle
mkdirSync(donnees, { recursive: true });
for (const f of [fichierNeuf, `${fichierNeuf}-journal`, `${fichierNeuf}-wal`, `${fichierNeuf}-shm`]) rmSync(f, { force: true });
await initialiserBase(dossierBackend, urlSqlite, () => {});

// 2. Lecture PostgreSQL, écriture SQLite, table par table
const source = new pg.Client({ connectionString: urlSource });
await source.connect();
const cible = ouvrir(dossierBackend, urlSqlite);

const tables = (
  await cible.execute(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations'`)
).rows.map((r) => r.name);

function convertir(valeur, typePg) {
  if (valeur === null || valeur === undefined) return null;
  if (valeur instanceof Date) return valeur.toISOString();
  if (typeof valeur === 'boolean') return valeur ? 1 : 0;
  if (typePg === 'numeric') return Number(valeur);
  if (typePg === 'ARRAY') {
    // numeric[] arrive en tableau de textes ; enum[] arrive en texte « {A,B} »
    const tableau = Array.isArray(valeur) ? valeur : String(valeur).replace(/^\{|\}$/g, '').split(',').filter(Boolean);
    return JSON.stringify(tableau.map((v) => (v !== '' && !Number.isNaN(Number(v)) ? Number(v) : v)));
  }
  if (typePg === 'json' || typePg === 'jsonb') return JSON.stringify(valeur);
  return valeur;
}

const instructions = [];
const bilan = [];
for (const table of tables) {
  const colonnesCible = (await cible.execute(`PRAGMA table_info("${table}")`)).rows.map((r) => r.name);
  const typesPg = new Map(
    (
      await source.query(
        `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = $1`,
        [table],
      )
    ).rows.map((r) => [r.column_name, r.data_type]),
  );
  instructions.push(`DELETE FROM "${table}"`);
  if (typesPg.size === 0) {
    bilan.push(`${table} : absente de la base source`);
    continue;
  }
  const colonnes = colonnesCible.filter((c) => typesPg.has(c));
  const { rows } = await source.query(`SELECT ${colonnes.map((c) => `"${c}"`).join(', ')} FROM "${table}"`);
  for (const ligne of rows) {
    instructions.push({
      sql: `INSERT INTO "${table}" (${colonnes.map((c) => `"${c}"`).join(', ')}) VALUES (${colonnes.map(() => '?').join(', ')})`,
      args: colonnes.map((c) => convertir(ligne[c], typesPg.get(c))),
    });
  }
  bilan.push(`${table} : ${rows.length}`);
}
await source.end();
// Tout ou rien : une seule transaction ; contraintes de clés étrangères suspendues (ordre des tables libre).
// (PRAGMA foreign_keys est sans effet à l'intérieur d'une transaction : réglé avant.)
await cible.execute('PRAGMA foreign_keys = OFF');
await cible.batch(instructions, 'write');
const controle = (await cible.execute('PRAGMA foreign_key_check')).rows;
await cible.execute('PRAGMA foreign_keys = ON');
// Écrit tout dans le fichier principal (et vide le journal WAL) avant de rendre la main
const integrite = (await cible.execute('PRAGMA integrity_check')).rows.map((r) => Object.values(r)[0]);
if (integrite[0] !== 'ok') throw new Error(`Base neuve incorrecte : ${integrite.join(', ')}`);
const verification = (await cible.execute('SELECT (SELECT count(*) FROM eleves) AS eleves, (SELECT count(*) FROM factures) AS factures')).rows[0];
cible.close();
console.log(`Contrôle après écriture : ${verification.eleves} élève(s), ${verification.factures} facture(s), intégrité ok`);

// Remplacement : l'ancienne base (et ses fichiers de journal) est gardée sous un autre nom
for (const suffixe of ['', '-wal', '-shm', '-journal']) {
  const f = `${fichierBase}${suffixe}`;
  if (existsSync(f)) renameSync(f, join(donnees, `mameta-remplacee-${horodatage}.db${suffixe}`));
}
// Le fichier neuf peut rester verrouillé un instant après sa fermeture (Windows) : quelques essais
for (let essai = 0; ; essai++) {
  try {
    renameSync(fichierNeuf, fichierBase);
    break;
  } catch (e) {
    if (essai >= 20) throw e;
    await new Promise((r) => setTimeout(r, 500));
  }
}
console.log(`Ancienne base gardée : mameta-remplacee-${horodatage}.db`);
console.log(bilan.filter((l) => !l.endsWith(': 0')).join('\n'));
if (controle.length) console.warn(`Attention : ${controle.length} référence(s) incohérente(s) signalée(s) par SQLite`);

// 3. Documents et photos des élèves
const uploads = join(racine, 'backend', 'uploads');
if (existsSync(uploads)) {
  await cp(uploads, join(donnees, 'uploads'), { recursive: true });
  console.log('Documents et photos copiés');
}
console.log('Copie terminée : lancez la version bureau et connectez-vous avec vos comptes habituels.');
