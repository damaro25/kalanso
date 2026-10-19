// Essai de bout en bout de la synchronisation, sur des copies : un serveur de test (PostgreSQL copie) doit tourner sur
// http://127.0.0.1:3100 ; ce script crée un PC de test (SQLite neuf) sur le port 37130 et déroule les scénarios :
// première synchro, envoi d'un paiement du PC (série B1), changement fait sur le serveur, conflit, suppression.
// Usage : node scripts/essai-synchronisation.cjs <email serveur> <mot de passe serveur>
const { spawn } = require('node:child_process');
const { mkdirSync, rmSync } = require('node:fs');
const path = require('node:path');
const { initialiserBase, COMPTE_INITIAL } = require('../lib/init-db.js');

const [email, motDePasse] = process.argv.slice(2);
const SERVEUR = 'http://127.0.0.1:3100';
const BUREAU = 'http://127.0.0.1:37130';
const backend = path.join(__dirname, '..', 'build', 'backend');
const dossier = path.join(process.env.TEMP, 'mameta-sync-bureau');
rmSync(dossier, { recursive: true, force: true });
mkdirSync(dossier, { recursive: true });
const url = `file:${path.join(dossier, 'mameta.db').replace(/\\/g, '/')}`;

let echecs = 0;
const verifier = (condition, libelle) => {
  console.log(`${condition ? 'OK ' : 'ÉCHEC'}  ${libelle}`);
  if (!condition) echecs++;
};

async function appel(base, chemin, { methode = 'GET', corps, jeton } = {}) {
  const r = await fetch(base + chemin, {
    method: methode,
    headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: corps === undefined ? undefined : JSON.stringify(corps),
  });
  const t = await r.text();
  const j = t ? JSON.parse(t) : null;
  if (!r.ok) throw new Error(`${methode} ${chemin} : ${r.status} ${JSON.stringify(j)}`);
  return j;
}
const connexion = async (base, e, m) => (await appel(base, '/auth/login', { methode: 'POST', corps: { email: e, password: m } })).accessToken;

(async () => {
  await initialiserBase(backend, url, () => {});
  const bureau = spawn(process.execPath, [path.join(backend, 'dist', 'src', 'main.js')], {
    cwd: dossier,
    env: { ...process.env, DATABASE_URL: url, JWT_SECRET: 'bureau-test', PORT: '37130', HOST: '127.0.0.1', NODE_ENV: 'test' },
  });
  bureau.stderr.on('data', (d) => process.stderr.write(d));
  try {
    for (let i = 0; i < 60; i++) {
      try {
        await fetch(BUREAU + '/');
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
    const jetonServeur = await connexion(SERVEUR, email, motDePasse);
    let jetonBureau = await connexion(BUREAU, COMPTE_INITIAL.email, COMPTE_INITIAL.motDePasse);

    // 1. Réglages et test de connexion
    let config = await appel(BUREAU, '/sync/config', { jeton: jetonBureau });
    verifier(config.modeBureau === true && !config.urlServeur, 'PC : section en mode bureau, non configurée');
    config = await appel(BUREAU, '/sync/config', { methode: 'PUT', corps: { urlServeur: SERVEUR, email, motDePasse, actif: true }, jeton: jetonBureau });
    verifier(config.motDePasseEnregistre && !('motDePasseChiffre' in config) && !JSON.stringify(config).includes(motDePasse), 'Mot de passe enregistré, jamais renvoyé');
    const test = await appel(BUREAU, '/sync/tester', { methode: 'POST', jeton: jetonBureau });
    verifier(test.ok, `Tester la connexion : ${test.message}`);
    const serveurWeb = await appel(SERVEUR, '/sync/config', { jeton: jetonServeur });
    verifier(serveurWeb.modeBureau === false, 'Serveur : la section est masquée (mode web)');

    // 2. Première synchronisation : le PC repart des données du serveur
    const r1 = await appel(BUREAU, '/sync/maintenant', { methode: 'POST', jeton: jetonBureau });
    console.log('     ', r1.etat);
    jetonBureau = await connexion(BUREAU, email, motDePasse); // les comptes viennent maintenant du serveur
    const elevesS = await appel(SERVEUR, '/eleves', { jeton: jetonServeur });
    const elevesB = await appel(BUREAU, '/eleves', { jeton: jetonBureau });
    verifier(elevesB.length === elevesS.length && elevesB.length > 0, `Mêmes élèves des deux côtés (${elevesB.length})`);
    const dashS = await appel(SERVEUR, '/reporting/dashboard', { jeton: jetonServeur });
    const dashB = await appel(BUREAU, '/reporting/dashboard', { jeton: jetonBureau });
    verifier(dashS.ecolage.paye === dashB.ecolage.paye && dashS.ecolage.facture === dashB.ecolage.facture, `Même écolage payé/facturé (${dashB.ecolage.paye} / ${dashB.ecolage.facture})`);
    config = await appel(BUREAU, '/sync/config', { jeton: jetonBureau });
    verifier(config.poste === 'B1' || /^B\d+$/.test(config.poste ?? ''), `Poste enregistré : ${config.poste}`);

    // 3. Paiement fait sur le PC (hors ligne), envoyé au serveur, avec la série de reçus du poste
    const impayees = await appel(BUREAU, '/factures/impayes', { jeton: jetonBureau });
    const facture = impayees.find((f) => f.type !== 'ECOLAGE') ?? impayees[0];
    const paiement = await appel(BUREAU, '/paiements', { methode: 'POST', corps: { factureId: facture.id, montant: 1000, mode: 'ESPECES' }, jeton: jetonBureau });
    const r2 = await appel(BUREAU, '/sync/maintenant', { methode: 'POST', jeton: jetonBureau });
    console.log('     ', r2.etat);
    const factureS = await appel(SERVEUR, `/factures/${facture.id}`, { jeton: jetonServeur });
    const pS = factureS.paiements?.find((p) => p.id === paiement.id);
    verifier(!!pS, 'Le paiement du PC est arrivé sur le serveur');
    verifier(pS && pS.numero >= 1000000, `Numéro de reçu dans la série du poste (${pS?.numero})`);

    // 4. Changement fait sur le web, reçu par le PC
    const eleve = elevesS[0];
    await appel(SERVEUR, `/eleves/${eleve.id}`, { methode: 'PATCH', corps: { adresse: 'Kissosso (modifié sur le web)' }, jeton: jetonServeur });
    await appel(BUREAU, '/sync/maintenant', { methode: 'POST', jeton: jetonBureau });
    let ficheB = await appel(BUREAU, `/eleves/${eleve.id}/fiche`, { jeton: jetonBureau });
    verifier(ficheB.adresse === 'Kissosso (modifié sur le web)', 'Modification du web reçue par le PC');

    // 5. Conflit : même élève modifié des deux côtés ; la dernière modification gagne
    await appel(SERVEUR, `/eleves/${eleve.id}`, { methode: 'PATCH', corps: { lieuNaissance: 'Conakry (web)' }, jeton: jetonServeur });
    await appel(SERVEUR, '/sync/config', { jeton: jetonServeur }); // (rien)
    await new Promise((r) => setTimeout(r, 1500));
    await appel(BUREAU, `/eleves/${eleve.id}`, { methode: 'PATCH', corps: { lieuNaissance: 'Kindia (PC, plus récent)' }, jeton: jetonBureau });
    // le serveur ne « voit » sa modification qu'à son prochain balayage : ici à la réception du PC, avec l'heure du balayage
    await appel(BUREAU, '/sync/maintenant', { methode: 'POST', jeton: jetonBureau });
    const ficheS = await appel(SERVEUR, `/eleves/${eleve.id}/fiche`, { jeton: jetonServeur });
    ficheB = await appel(BUREAU, `/eleves/${eleve.id}/fiche`, { jeton: jetonBureau });
    verifier(ficheS.lieuNaissance === ficheB.lieuNaissance, `Conflit résolu, même valeur des deux côtés (${ficheS.lieuNaissance})`);
    verifier(ficheS.lieuNaissance === 'Kindia (PC, plus récent)', 'La modification la plus récente (celle du PC) a gagné');

    // 6. Suppression faite sur le web (un poste de budget), répercutée sur le PC
    const budgetS = await appel(SERVEUR, '/finance/budget', { jeton: jetonServeur }).catch(() => null);
    const poste = budgetS?.prevision?.decaissements?.lignes?.[0];
    if (poste) {
      await fetch(`${SERVEUR}/finance/budget/postes/${poste.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${jetonServeur}`, 'X-Code-Suppression': '2026' } });
      await appel(BUREAU, '/sync/maintenant', { methode: 'POST', jeton: jetonBureau });
      const budgetB = await appel(BUREAU, '/finance/budget', { jeton: jetonBureau });
      verifier(!budgetB.prevision.decaissements.lignes.some((l) => l.id === poste.id), 'Suppression du web répercutée sur le PC');
    } else {
      console.log('—    (pas de poste de budget à supprimer : scénario suppression non joué)');
    }

    config = await appel(BUREAU, '/sync/config', { jeton: jetonBureau });
    console.log('      État final :', config.dernierEtat, '| en attente :', config.enAttente);
  } catch (e) {
    echecs++;
    console.error('ERREUR', e.message);
  } finally {
    bureau.kill();
    console.log(echecs ? `\n${echecs} échec(s)` : '\nTous les scénarios sont passés');
    process.exit(echecs ? 1 : 0);
  }
})();
