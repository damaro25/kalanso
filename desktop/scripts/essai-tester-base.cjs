// Essai de « Tester la base » sur un PC de test (SQLite neuf, port 37131) contre une base PostgreSQL donnée.
// Usage : node scripts/essai-tester-base.cjs <hôte> <port> <base> <utilisateur> <mot de passe>
const { spawn } = require('node:child_process');
const { mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const { initialiserBase, COMPTE_INITIAL } = require('../lib/init-db.js');

const [bdHote, bdPort, bdNom, bdUtilisateur, bdMotDePasse] = process.argv.slice(2);
const BUREAU = 'http://127.0.0.1:37131';
const backend = path.join(__dirname, '..', 'build', 'backend');
const dossier = path.join(process.env.TEMP, 'mameta-essai-base');
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;

async function appel(chemin, { methode = 'GET', corps, jeton } = {}) {
  const r = await fetch(BUREAU + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  return { statut: r.status, corps: await r.json().catch(() => null) };
}

(async () => {
  await initialiserBase(backend, url, () => {});
  const p = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'essai-base', PORT: '37131', HOST: '127.0.0.1', NODE_ENV: 'test' },
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(BUREAU + '/');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const jeton = (await appel('/auth/login', { methode: 'POST', corps: { email: COMPTE_INITIAL.email, password: COMPTE_INITIAL.motDePasse } })).corps.accessToken;
    const c = await appel('/sync/config', { methode: 'PUT', corps: { bdHote, bdPort: Number(bdPort), bdNom, bdUtilisateur, bdMotDePasse }, jeton });
    console.log('Réglages :', c.statut, JSON.stringify(c.corps).includes(bdMotDePasse) ? 'MOT DE PASSE RENVOYÉ !' : 'mot de passe non renvoyé', c.corps.bdMotDePasseEnregistre);
    const ok = await appel('/sync/tester-base', { methode: 'POST', jeton });
    console.log('Tester la base :', ok.statut, ok.corps.message);
    await appel('/sync/config', { methode: 'PUT', corps: { bdMotDePasse: 'faux-mot-de-passe' }, jeton });
    const ko = await appel('/sync/tester-base', { methode: 'POST', jeton });
    console.log('Mauvais mot de passe :', ko.statut, ko.corps.message);
  } finally {
    p.kill();
  }
})();
