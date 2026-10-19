// Vérifie une base SQLite de la version bureau (par ex. après copier-donnees.mjs) : lance le backend embarqué
// dessus et appelle les pages principales avec un jeton du premier utilisateur.
// Usage (depuis desktop/, après npm run preparer) : node scripts/verifier-base.cjs <dossier contenant mameta.db>
const { spawn } = require('node:child_process');
const path = require('node:path');

const dossier = process.argv[2];
const backend = path.resolve(__dirname, '..', 'build', 'backend');
const jwt = require(require.resolve('jsonwebtoken', { paths: [backend] }));
const { ouvrir } = require('../lib/init-db.js');
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;

(async () => {
  const c = ouvrir(backend, url);
  const u = (await c.execute('SELECT id, ecoleId, role, email FROM utilisateurs LIMIT 1')).rows[0];
  const e = (await c.execute('SELECT id FROM eleves LIMIT 1')).rows[0];
  c.close();
  const token = jwt.sign({ userId: u.id, ecoleId: u.ecoleId, role: u.role, email: u.email }, 'verification', { expiresIn: '1h' });
  const api = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'verification', PORT: '37111', HOST: '127.0.0.1' },
  });
  api.stderr.on('data', (d) => process.stderr.write(d));
  for (let i = 0; i < 60; i++) {
    try {
      await fetch('http://127.0.0.1:37111/');
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const h = { Authorization: `Bearer ${token}` };
  const pages = ['/reporting/dashboard', '/eleves', ...(e ? [`/eleves/${e.id}/fiche`] : []), '/finance/budget', '/factures/impayes', '/formations', '/eleves/export.xlsx'];
  let erreurs = 0;
  for (const chemin of pages) {
    const r = await fetch(`http://127.0.0.1:37111${chemin}`, { headers: h });
    const corps = Buffer.from(await r.arrayBuffer());
    if (r.status >= 400) erreurs++;
    console.log(chemin, r.status, chemin.endsWith('.xlsx') ? `${corps.length} octets` : corps.toString().slice(0, 110));
  }
  api.kill();
  process.exit(erreurs ? 1 : 0);
})();
