// Essai des pièces du dossier d'un élève sur une COPIE de la base bureau (app fermée) : ajout, changement de
// type, remplacement du fichier, ouverture, suppression. La base réelle n'est jamais ouverte en écriture.
// Usage : node scripts/essai-documents-eleve.cjs
const { spawn } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, readdirSync, rmSync } = require('node:fs');
const path = require('node:path');

const backend = path.join(__dirname, '..', 'build', 'backend');
const jwt = require(require.resolve('jsonwebtoken', { paths: [backend] }));
const { createClient } = require(require.resolve('@libsql/client', { paths: [backend] }));
const source = path.join(process.env.APPDATA, 'Mamé-TA Gestion scolaire', 'donnees', 'mameta.db');
const dossier = path.join(process.env.TEMP, 'mameta-essai-documents');
const API = 'http://127.0.0.1:37141';
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
copyFileSync(source, path.join(dossier, 'mameta.db'));
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;
const uploads = path.join(dossier, 'uploads', 'admissions');
const fichiers = () => (existsSync(uploads) ? readdirSync(uploads) : []);

function verifier(ok, libelle) {
  console.log(`${ok ? 'OK ' : 'ÉCHEC'} ${libelle}`);
  if (!ok) process.exitCode = 1;
}

(async () => {
  const c = createClient({ url });
  const u = (await c.execute(`SELECT id, ecoleId, role, email FROM utilisateurs WHERE role = 'FONDATEUR' LIMIT 1`)).rows[0];
  const sansDemande = (await c.execute('SELECT id FROM eleves e WHERE NOT EXISTS (SELECT 1 FROM demandes_inscription d WHERE d.eleveId = e.id) LIMIT 1')).rows[0];
  c.close();
  const jeton = jwt.sign({ userId: u.id, ecoleId: u.ecoleId, role: u.role, email: u.email }, 'essai-documents', { expiresIn: '10m' });
  const h = { Authorization: `Bearer ${jeton}` };

  const p = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'essai-documents', PORT: '37141', HOST: '127.0.0.1', NODE_ENV: 'test' },
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
    const eleves = await (await fetch(API + '/eleves', { headers: h })).json();
    const cibles = [eleves[0].id, ...(sansDemande ? [sansDemande.id] : [])];
    for (const eleveId of cibles) {
      const avant = await (await fetch(`${API}/eleves/${eleveId}/documents`, { headers: h })).json();
      const form = new FormData();
      form.append('type', 'EXTRAIT_NAISSANCE');
      form.append('fichier', new Blob(['%PDF-1.4 essai'], { type: 'application/pdf' }), 'Extrait réel.pdf');
      const ajout = await fetch(`${API}/eleves/${eleveId}/documents`, { method: 'POST', headers: h, body: form });
      const doc = await ajout.json();
      verifier(ajout.status === 201 && doc.nomFichier === 'Extrait réel.pdf', `ajout (${eleveId === sansDemande?.id ? 'élève sans dossier' : 'élève avec dossier'}) : ${ajout.status} ${doc.nomFichier}`);
      const apres = await (await fetch(`${API}/eleves/${eleveId}/documents`, { headers: h })).json();
      verifier(apres.length === avant.length + 1, `liste : ${avant.length} → ${apres.length} pièce(s)`);

      const typeForm = new FormData();
      typeForm.append('type', 'ATTESTATION');
      const t = await (await fetch(`${API}/eleves/${eleveId}/documents/${doc.id}`, { method: 'PUT', headers: h, body: typeForm })).json();
      verifier(t.type === 'ATTESTATION', `changement de type : ${t.type}`);

      const ancien = fichiers().length;
      const rempl = new FormData();
      rempl.append('fichier', new Blob(['image'], { type: 'image/png' }), 'photo.png');
      const r = await (await fetch(`${API}/eleves/${eleveId}/documents/${doc.id}`, { method: 'PUT', headers: h, body: rempl })).json();
      verifier(r.nomFichier === 'photo.png' && r.type === 'ATTESTATION' && fichiers().length === ancien, `remplacement : ${r.nomFichier}, ancien fichier retiré`);

      const vu = await fetch(`${API}/eleves/${eleveId}/documents/${doc.id}/fichier`, { headers: h });
      verifier(vu.status === 200 && (await vu.text()) === 'image', `ouverture : ${vu.status} ${vu.headers.get('content-type')}`);

      const sup = await fetch(`${API}/eleves/${eleveId}/documents/${doc.id}`, { method: 'DELETE', headers: h });
      const fin = await (await fetch(`${API}/eleves/${eleveId}/documents`, { headers: h })).json();
      verifier(sup.status === 200 && fin.length === avant.length && fichiers().length === ancien - 1, `suppression : ${sup.status}, ${fin.length} pièce(s)`);
    }
    const mauvais = new FormData();
    mauvais.append('type', 'PHOTO');
    mauvais.append('fichier', new Blob(['x'], { type: 'application/x-msdownload' }), 'virus.exe');
    verifier((await fetch(`${API}/eleves/${cibles[0]}/documents`, { method: 'POST', headers: h, body: mauvais })).status === 400, 'format refusé (.exe)');
  } finally {
    p.kill();
  }
})();
