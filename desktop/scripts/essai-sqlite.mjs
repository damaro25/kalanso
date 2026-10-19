// Essai sans Electron : base SQLite temporaire, migrations, compte initial, backend embarqué et connexion.
// Usage : node scripts/essai-sqlite.mjs <dossier vide>
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { initialiserBase, ouvrir, COMPTE_INITIAL } = require('../lib/init-db.js');
const desktop = join(dirname(fileURLToPath(import.meta.url)), '..');
const dossierBackend = join(desktop, 'build', 'backend');
const dossier = process.argv[2];
mkdirSync(dossier, { recursive: true });
const url = `file:${join(dossier, 'essai.db').replace(/\\/g, '/')}`;

await initialiserBase(dossierBackend, url);
await initialiserBase(dossierBackend, url); // relancé : rien à refaire
const api = spawn(process.execPath, [join(dossierBackend, 'dist', 'src', 'main.js')], {
  cwd: dossier,
  env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'essai', JWT_EXPIRES_IN: '8h', PORT: '37110', HOST: '127.0.0.1' },
});
api.stderr.on('data', (d) => process.stderr.write(d));
try {
  let token;
  for (let i = 0; i < 60 && !token; i++) {
    try {
      const r = await fetch('http://127.0.0.1:37110/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: COMPTE_INITIAL.email, password: COMPTE_INITIAL.motDePasse }),
      });
      const corps = await r.json();
      console.log('Connexion :', r.status);
      token = corps.accessToken;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const h = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  // Quelques écritures et lectures typiques
  const annee = await (await fetch('http://127.0.0.1:37110/annees-scolaires', {
    method: 'POST', headers: h,
    body: JSON.stringify({ libelle: '2026-2027', dateDebut: '2026-10-01', dateFin: '2027-07-31', courante: true }),
  })).json();
  console.log('Année :', annee.id ? 'créée' : JSON.stringify(annee).slice(0, 200));
  for (const chemin of ['/reporting/dashboard', '/eleves', '/finance/budget']) {
    const r = await fetch(`http://127.0.0.1:37110${chemin}`, { headers: h });
    console.log(chemin, r.status, (await r.text()).slice(0, 120));
  }
  // Représentation des valeurs dans SQLite
  const c = ouvrir(dossierBackend, url);
  console.log((await c.execute('SELECT dernierLoginAt, actif, createdAt FROM utilisateurs')).rows);
  console.log((await c.execute('SELECT dateDebut, courante FROM annees_scolaires')).rows);
  console.log((await c.execute('SELECT poste, montants FROM budget_depenses LIMIT 2')).rows);
  c.close();
} finally {
  api.kill();
}
