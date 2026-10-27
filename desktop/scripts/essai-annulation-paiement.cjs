// Essai de l'annulation de paiements sur une COPIE d'une ancienne base bureau (jamais la base en service) : deux
// éléments payés ensemble (même lot), refus sans le bon code ou hors fondateur, annulation d'un élément puis de
// l'autre ; les factures, le reçu du lot et la trace dans la fiche doivent suivre.
// Usage : node scripts/essai-annulation-paiement.cjs <ancienne base .db>
const { spawn } = require('node:child_process');
const { copyFileSync, mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const { initialiserBase } = require('../lib/init-db.js');

const [source] = process.argv.slice(2);
const backend = path.join(__dirname, '..', 'build', 'backend');
const jwt = require(require.resolve('jsonwebtoken', { paths: [backend] }));
const { createClient } = require(require.resolve('@libsql/client', { paths: [backend] }));
const dossier = path.join(process.env.TEMP, 'mameta-essai-annulation');
const API = 'http://127.0.0.1:37152';
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
copyFileSync(source, path.join(dossier, 'mameta.db'));
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;

const verifier = (ok, message) => {
  if (!ok) throw new Error(message);
  console.log('ok :', message);
};

(async () => {
  await initialiserBase(backend, url, () => {});
  const c = createClient({ url });
  const u = (await c.execute(`SELECT id, ecoleId, role, email FROM utilisateurs WHERE role = 'FONDATEUR' LIMIT 1`)).rows[0];
  // Un élève avec au moins deux factures hors écolage sans versement (pas de règle d'ordre entre elles)
  const dues = (
    await c.execute(`SELECT id, eleveId, type, libelle, montantTotal FROM factures
      WHERE montantPaye = 0 AND montantTotal > 0 AND statut <> 'ANNULEE' AND type IN ('INSCRIPTION', 'ASSURANCE', 'AUTRE', 'FOURNITURES', 'TRANSPORT', 'CANTINE')`)
  ).rows;
  const parEleve = new Map();
  for (const f of dues) parEleve.set(f.eleveId, [...(parEleve.get(f.eleveId) ?? []), f]);
  let factures = ([...parEleve.values()].find((l) => l.length >= 2) ?? []).slice(0, 2);
  if (factures.length < 2) {
    // À défaut : la tranche 1 d'écolage d'un élève qui doit aussi une autre facture
    const t1 = (await c.execute(`SELECT id, eleveId, type, libelle, montantTotal FROM factures WHERE montantPaye = 0 AND statut <> 'ANNULEE' AND type = 'ECOLAGE' AND libelle LIKE '%Tranche 1'`)).rows;
    const f = t1.find((t) => parEleve.has(t.eleveId));
    if (!f) throw new Error('Aucun élève avec deux éléments impayés dans cette base');
    factures = [parEleve.get(f.eleveId)[0], f];
  }
  const eleveId = factures[0].eleveId;
  // Le rôle est relu en base à chaque requête : un compte comptable d'essai, copie du fondateur (dans la copie de la base)
  const colonnes = (await c.execute('PRAGMA table_info(utilisateurs)')).rows.map((r) => `"${r.name}"`);
  const valeurs = colonnes.map((col) => (col === '"id"' ? "'essai-comptable'" : col === '"email"' ? "'essai-comptable@mameta.gn'" : col === '"role"' ? "'COMPTABLE'" : col));
  await c.execute({ sql: `INSERT INTO utilisateurs (${colonnes.join(', ')}) SELECT ${valeurs.join(', ')} FROM utilisateurs WHERE id = ?`, args: [u.id] });
  const signer = (userId, role) => jwt.sign({ userId, ecoleId: u.ecoleId, role, email: u.email }, 'essai-annul', { expiresIn: '10m' });
  const h = { Authorization: `Bearer ${signer(u.id, 'FONDATEUR')}`, 'Content-Type': 'application/json' };
  const hComptable = { Authorization: `Bearer ${signer('essai-comptable', 'COMPTABLE')}`, 'Content-Type': 'application/json' };
  const facture = async (id) => (await c.execute({ sql: 'SELECT montantPaye, statut FROM factures WHERE id = ?', args: [id] })).rows[0];

  const p = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'essai-annul', PORT: '37152', HOST: '127.0.0.1', NODE_ENV: 'test' },
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
    for (const f of factures) {
      const montant = f.type === 'ECOLAGE' ? 10000 : Number(f.montantTotal);
      const r = await fetch(API + '/paiements', { method: 'POST', headers: h, body: JSON.stringify({ factureId: f.id, montant, mode: 'ESPECES', reference }) });
      const corps = await r.json();
      if (r.status !== 201) throw new Error(`paiement ${f.libelle} : ${r.status} ${JSON.stringify(corps)}`);
      ids.push(corps.id);
      console.log(`payé ${f.libelle} : ${montant}`);
    }

    const annuler = (paiementIds, entetes, code, motif = 'essai') =>
      fetch(API + '/paiements/annulation', { method: 'POST', headers: { ...entetes, ...(code ? { 'X-Code-Suppression': code } : {}) }, body: JSON.stringify({ paiementIds, motif }) });

    verifier((await annuler([ids[0]], hComptable, '2026')).status === 403, 'le comptable ne peut pas annuler');
    verifier((await annuler([ids[0]], h)).status === 403, 'sans code : refus');
    verifier((await annuler([ids[0]], h, '1111')).status === 403, 'mauvais code : refus');
    verifier((await annuler([ids[0]], h, '2026', '  ')).status === 400, 'sans motif : refus');

    let r = await annuler([ids[0]], h, '2026', 'Essai : saisi deux fois');
    verifier(r.status === 201, `annulation du 1er élément (${r.status} ${JSON.stringify(await r.json())})`);
    const f0 = await facture(factures[0].id);
    verifier(Number(f0.montantPaye) === 0 && f0.statut === 'IMPAYEE', '1re facture revenue à impayée');
    verifier((await annuler([ids[0]], h, '2026')).status === 404, 'une 2e annulation du même paiement est refusée');

    r = await fetch(`${API}/paiements/${ids[1]}/recu`, { headers: h });
    verifier(r.status === 200, 'le reçu du lot se réimprime avec l’élément restant');
    r = await fetch(`${API}/paiements/${ids[0]}/recu`, { headers: h });
    verifier(r.status !== 200, 'plus de reçu pour le paiement annulé');

    r = await annuler([ids[1]], h, '2026', 'Essai : fin');
    verifier(r.status === 201, 'annulation du 2e élément');
    const f1 = await facture(factures[1].id);
    verifier(Number(f1.montantPaye) === 0, '2e facture revenue à 0');

    const fiche = await (await fetch(`${API}/eleves/${eleveId}/fiche`, { headers: h })).json();
    const traces = (fiche.paiementsAnnules ?? []).filter((a) => ids.includes(a.paiementId));
    verifier(traces.length === 2 && traces.every((t) => t.motif.startsWith('Essai')), 'la fiche montre les 2 paiements annulés avec leur motif');
    const restants = fiche.factures.flatMap((f) => f.paiements).filter((x) => ids.includes(x.id));
    verifier(restants.length === 0, 'les paiements annulés ne comptent plus dans les factures');
    console.log('ESSAI RÉUSSI');
  } finally {
    p.kill();
    c.close();
  }
})().catch((e) => {
  console.error('ÉCHEC', e.message);
  process.exitCode = 1;
});
