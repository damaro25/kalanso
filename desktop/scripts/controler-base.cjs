// Contrôle d'une base SQLite de la version bureau (lecture seule) : intégrité et nombre d'enregistrements.
// Usage : node scripts/controler-base.cjs <dossier contenant mameta.db>   (sans argument : la base installée)
const path = require('node:path');
const { createClient } = require(require.resolve('@libsql/client', { paths: [path.join(__dirname, '..', 'build', 'backend')] }));

const dossier = process.argv[2] || path.join(process.env.APPDATA, 'Mamé-TA Gestion scolaire', 'donnees');
const fichier = path.join(dossier, 'mameta.db');

(async () => {
  console.log(`Base : ${fichier}`);
  const c = createClient({ url: `file:${fichier.replace(/\\/g, '/')}` });
  try {
    console.log('quick_check :', (await c.execute('PRAGMA quick_check')).rows.map((r) => Object.values(r)[0]).slice(0, 5));
  } catch (e) {
    console.log('quick_check : ERREUR', e.message);
  }
  for (const t of ['utilisateurs', 'eleves', 'factures', 'paiements']) {
    try {
      console.log(t, (await c.execute(`SELECT count(*) AS n FROM ${t}`)).rows[0].n);
    } catch (e) {
      console.log(t, 'ERREUR', e.message);
    }
  }
  c.close();
})();
