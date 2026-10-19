// Met la base SQLite à jour (migrations) et, au premier lancement, crée l'école et le compte du fondateur.
// Utilise les dépendances du backend embarqué (@libsql/client, bcrypt).
const { join } = require('node:path');
const { appliquerMigrations } = require('./migrations');

const COMPTE_INITIAL = { email: 'fondateur@mameta.gn', motDePasse: 'mameta2026' };

function ouvrir(dossierBackend, url) {
  const { createClient } = require(require.resolve('@libsql/client', { paths: [dossierBackend] }));
  return createClient({ url });
}

async function initialiserBase(dossierBackend, url, journal = console.log) {
  const bcrypt = require(require.resolve('bcrypt', { paths: [dossierBackend] }));
  const client = ouvrir(dossierBackend, url);
  try {
    // Journal classique (DELETE) plutôt que WAL : sous Windows, un fichier WAL partagé entre plusieurs processus
    // (serveur, outils) a déjà abîmé une base. Le mode est enregistré dans le fichier et vaut pour le serveur.
    await client.execute('PRAGMA journal_mode = DELETE');
    const n = await appliquerMigrations(client, join(dossierBackend, 'migrations'), journal);
    journal(`${n} migration(s) appliquée(s)`);

    // N° de reçu (le serveur PostgreSQL a son déclencheur ; SQLite non) : série du poste quand ce PC est enregistré
    // auprès du serveur de synchronisation (poste n : n × 1 000 000 + 1...), sinon suite de la série de l'école.
    await client.execute('DROP TRIGGER IF EXISTS paiements_numero');
    await client.execute(`
      CREATE TRIGGER paiements_numero AFTER INSERT ON paiements
      WHEN NEW.numero IS NULL
      BEGIN
        UPDATE paiements SET numero = (
          SELECT CASE
            WHEN c.n IS NULL THEN MAX(
              COALESCE((SELECT MAX(numero) FROM paiements WHERE ecoleId = NEW.ecoleId AND numero < 1000000), 0) + 1,
              COALESCE((SELECT numeroRecuDepart FROM ecoles WHERE id = NEW.ecoleId), 1))
            ELSE COALESCE((SELECT MAX(numero) FROM paiements WHERE ecoleId = NEW.ecoleId
              AND numero >= c.n * 1000000 AND numero < (c.n + 1) * 1000000), c.n * 1000000) + 1
          END
          FROM (SELECT (SELECT posteNumero FROM sync_config WHERE id = 'local') AS n) c)
        WHERE id = NEW.id;
      END`);

    const { rows } = await client.execute('SELECT count(*) AS n FROM utilisateurs');
    if (Number(rows[0].n) === 0) {
      const hash = await bcrypt.hash(COMPTE_INITIAL.motDePasse, 12);
      const maintenant = new Date().toISOString();
      await client.batch(
        [
          {
            sql: `INSERT OR IGNORE INTO ecoles (id, nom, ville, actif, createdAt, updatedAt)
                  VALUES ('ecole-mameta', 'Les Écoles Mamé-TA', 'Conakry', 1, ?, ?)`,
            args: [maintenant, maintenant],
          },
          {
            sql: `INSERT INTO utilisateurs (id, ecoleId, nom, prenom, email, motDePasseHash, role, actif, createdAt, updatedAt)
                  VALUES ('fondateur-initial', 'ecole-mameta', 'Fondateur', 'Compte', ?, ?, 'FONDATEUR', 1, ?, ?)`,
            args: [COMPTE_INITIAL.email, hash, maintenant, maintenant],
          },
        ],
        'write',
      );
      journal(`Compte initial créé : ${COMPTE_INITIAL.email}`);
    }
  } finally {
    client.close();
  }
}

module.exports = { initialiserBase, ouvrir, COMPTE_INITIAL };
