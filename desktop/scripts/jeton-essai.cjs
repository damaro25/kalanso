// Affiche un jeton de connexion valable 10 minutes pour le premier utilisateur de la version bureau installée
// (signé avec le secret du poste) : sert aux vérifications de l'API après installation.
// Usage : node scripts/jeton-essai.cjs <dossier resources/backend installé> <dossier des données>
const path = require('node:path');

const [backend, donnees] = process.argv.slice(2);
const jwt = require(require.resolve('jsonwebtoken', { paths: [backend] }));
const { createClient } = require(require.resolve('@libsql/client', { paths: [backend] }));
const config = require(path.join(donnees, 'configuration.json'));

(async () => {
  const c = createClient({ url: `file:${path.join(donnees, 'mameta.db').replace(/\\/g, '/')}` });
  const u = (await c.execute('SELECT id, ecoleId, role, email FROM utilisateurs LIMIT 1')).rows[0];
  c.close();
  process.stdout.write(jwt.sign({ userId: u.id, ecoleId: u.ecoleId, role: u.role, email: u.email }, config.jwtSecret, { expiresIn: '10m' }));
})();
