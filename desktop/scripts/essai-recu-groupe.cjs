// Essai du reçu groupé sur une COPIE d'une ancienne base bureau (jamais la base en service) : trois paiements
// enregistrés ensemble (même référence « lot:… ») doivent donner un seul reçu, au total, « insc + T-sh + T1 ».
// Usage : node scripts/essai-recu-groupe.cjs <ancienne base .db> <dossier de sortie>
const { spawn } = require('node:child_process');
const { copyFileSync, mkdirSync, rmSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const { initialiserBase } = require('../lib/init-db.js');

const [source, sortie] = process.argv.slice(2);
const backend = path.join(__dirname, '..', 'build', 'backend');
const jwt = require(require.resolve('jsonwebtoken', { paths: [backend] }));
const { createClient } = require(require.resolve('@libsql/client', { paths: [backend] }));
const dossier = path.join(process.env.TEMP, 'mameta-essai-recu-groupe');
const API = 'http://127.0.0.1:37151';
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
copyFileSync(source, path.join(dossier, 'mameta.db'));
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;

(async () => {
  await initialiserBase(backend, url, () => {});
  const c = createClient({ url });
  const u = (await c.execute(`SELECT id, ecoleId, role, email FROM utilisateurs WHERE role = 'FONDATEUR' LIMIT 1`)).rows[0];
  // L'élève qui doit encore le plus d'éléments parmi inscription, T-shirt et tranche 1, sans versement dessus
  const dues = (
    await c.execute(`SELECT id, eleveId, type, libelle, montantTotal FROM factures
      WHERE montantPaye = 0 AND statut <> 'ANNULEE' AND (type IN ('INSCRIPTION', 'ASSURANCE') OR (type = 'ECOLAGE' AND libelle LIKE '%Tranche 1'))`)
  ).rows;
  const parEleve = new Map();
  for (const f of dues) parEleve.set(f.eleveId, [...(parEleve.get(f.eleveId) ?? []), f]);
  const factures = [...parEleve.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  if (factures.length < 2) throw new Error('Aucun élève avec au moins deux éléments impayés dans cette base');
  c.close();
  const jeton = jwt.sign({ userId: u.id, ecoleId: u.ecoleId, role: u.role, email: u.email }, 'essai-recu', { expiresIn: '10m' });
  const h = { Authorization: `Bearer ${jeton}`, 'Content-Type': 'application/json' };

  const p = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'essai-recu', PORT: '37151', HOST: '127.0.0.1', NODE_ENV: 'test' },
  });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(API + '/ecoles/public');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const reference = `lot:essai-${Date.now()}`;
    const ids = [];
    let total = 0;
    for (const f of factures) {
      const montant = f.type === 'ECOLAGE' ? 10000 : Number(f.montantTotal);
      const r = await fetch(API + '/paiements', { method: 'POST', headers: h, body: JSON.stringify({ factureId: f.id, montant, mode: 'ESPECES', reference }) });
      const corps = await r.json();
      if (r.status !== 201) throw new Error(`paiement ${f.type} : ${r.status} ${JSON.stringify(corps)}`);
      ids.push(corps.id);
      total += montant;
      console.log(`payé ${f.type} (${f.libelle}) : ${montant}`);
    }
    for (const [i, id] of ids.entries()) {
      const r = await fetch(`${API}/paiements/${id}/recu`, { headers: h });
      const pdf = Buffer.from(await r.arrayBuffer());
      writeFileSync(path.join(sortie, `recu-groupe-${i + 1}.pdf`), pdf);
      console.log(`reçu via le paiement ${i + 1} : ${r.status}, ${pdf.length} octets`);
    }
    console.log('total attendu :', total);
  } finally {
    p.kill();
  }
})().catch((e) => {
  console.error('ÉCHEC', e.message);
  process.exitCode = 1;
});
