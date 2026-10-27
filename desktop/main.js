// Version bureau de Mamé-TA : une base SQLite (un fichier, aucune installation séparée), le backend NestJS et
// l'interface, le tout sur ce PC. Données dans %APPDATA%\Mamé-TA Gestion scolaire\donnees (base mameta.db,
// documents, photos, sauvegardes) ; elles sont conservées en cas de désinstallation ou de mise à jour.
const { app, BrowserWindow, dialog, shell } = require('electron');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, writeFileSync, createReadStream, statSync, appendFileSync } = require('node:fs');
const http = require('node:http');
const { join, extname, normalize } = require('node:path');
const { initialiserBase, COMPTE_INITIAL } = require('./lib/init-db');

const PORT_API = 37100;
const PORT_INTERFACE = 37101;

const ressources = app.isPackaged ? process.resourcesPath : join(__dirname, 'build');
const dossierBackend = join(ressources, 'backend');
const dossierInterface = join(ressources, 'frontend');
const donnees = join(app.getPath('userData'), 'donnees');
const fichierJournal = join(donnees, 'journal.txt');

let fenetre = null;
let backend = null;
let serveurInterface = null;
let arrete = false; // serveur arrêté proprement

function journal(message) {
  try {
    appendFileSync(fichierJournal, `${new Date().toISOString()} ${message}\n`);
  } catch {
    // journal facultatif
  }
}

// Secrets propres à ce poste, créés au premier lancement.
function configuration() {
  const fichier = join(donnees, 'configuration.json');
  if (existsSync(fichier)) return JSON.parse(readFileSync(fichier, 'utf8'));
  const config = { jwtSecret: randomBytes(32).toString('hex') };
  writeFileSync(fichier, JSON.stringify(config, null, 2));
  return config;
}

// Base SQLite : un simple fichier dans le dossier des données (rien à démarrer ni à arrêter).
function urlBase() {
  return `file:${join(donnees, 'mameta.db').replace(/\\/g, '/')}`;
}

function demarrerBackend(url, config) {
  return new Promise((resolve, reject) => {
    const env = {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NODE_ENV: 'production',
      DATABASE_URL: url,
      JWT_SECRET: config.jwtSecret,
      JWT_EXPIRES_IN: '8h',
      PORT: String(PORT_API),
      HOST: '127.0.0.1',
      DOSSIER_SAUVEGARDES: join(donnees, 'sauvegardes'),
    };
    // Le backend écrit ses fichiers (documents, photos) sous son dossier courant : celui des données.
    backend = spawn(process.execPath, [join(dossierBackend, 'dist', 'src', 'main.js')], { cwd: donnees, env, windowsHide: true });
    backend.stdout.on('data', (d) => journal(`[api] ${String(d).trim()}`));
    backend.stderr.on('data', (d) => journal(`[api] ${String(d).trim()}`));
    backend.on('exit', (code) => {
      journal(`[api] arrêté (code ${code})`);
      if (!app.isQuitting) reject(new Error(`Le serveur s'est arrêté (code ${code}). Voir ${fichierJournal}`));
    });

    const debut = Date.now();
    const essayer = () => {
      const req = http.get({ host: '127.0.0.1', port: PORT_API, path: '/', timeout: 1000 }, (res) => {
        res.resume();
        resolve();
      });
      req.on('error', () => {
        // 3 minutes : au tout premier lancement, l'antivirus analyse les fichiers installés et ralentit le démarrage
        if (Date.now() - debut > 180_000) reject(new Error(`Le serveur ne répond pas. Voir ${fichierJournal}`));
        else setTimeout(essayer, 500);
      });
    };
    essayer();
  });
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
};

// Sert l'interface construite ; toute adresse inconnue renvoie index.html (navigation de l'application).
function demarrerInterface() {
  return new Promise((resolve, reject) => {
    serveurInterface = http.createServer((req, res) => {
      const chemin = decodeURIComponent((req.url ?? '/').split('?')[0]);
      let fichier = normalize(join(dossierInterface, chemin));
      if (!fichier.startsWith(dossierInterface) || !existsSync(fichier) || statSync(fichier).isDirectory()) {
        fichier = join(dossierInterface, 'index.html');
      }
      res.writeHead(200, { 'Content-Type': TYPES[extname(fichier).toLowerCase()] ?? 'application/octet-stream' });
      createReadStream(fichier).pipe(res);
    });
    serveurInterface.on('error', reject);
    serveurInterface.listen(PORT_INTERFACE, '127.0.0.1', resolve);
  });
}

function fenetreChargement() {
  const w = new BrowserWindow({ width: 420, height: 220, frame: false, resizable: false, show: true });
  const html = `<html><body style="font-family:Segoe UI,sans-serif;display:flex;flex-direction:column;align-items:center;
    justify-content:center;height:100%;margin:0;color:#0b7a5a"><h2 style="margin:0">Mamé-TA Gestion scolaire</h2>
    <p style="color:#555">Démarrage en cours…<br><small>Le premier lancement peut prendre une minute.</small></p></body></html>`;
  w.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  return w;
}

async function demarrer() {
  mkdirSync(donnees, { recursive: true });
  const chargement = fenetreChargement();
  try {
    const config = configuration();
    journal('Mise à jour de la base');
    await initialiserBase(dossierBackend, urlBase(), journal);
    journal('Démarrage du serveur');
    await demarrerBackend(urlBase(), config);
    await demarrerInterface();

    fenetre = new BrowserWindow({
      width: 1366,
      height: 860,
      show: false,
      autoHideMenuBar: true,
      title: 'Mamé-TA Gestion scolaire',
      icon: join(__dirname, 'icone.png'),
    });
    // Liens externes (WhatsApp, sites) : dans le navigateur du PC, pas dans l'application
    fenetre.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith(`http://127.0.0.1:${PORT_INTERFACE}`) || url.startsWith('blob:')) return { action: 'allow' };
      shell.openExternal(url);
      return { action: 'deny' };
    });
    // Fermeture de la fenêtre : on arrête d'abord le serveur, puis on quitte
    fenetre.on('close', (e) => {
      if (arrete) return;
      e.preventDefault();
      fenetre.hide();
      arreter().finally(() => {
        arrete = true;
        app.quit();
      });
    });
    await fenetre.loadURL(`http://127.0.0.1:${PORT_INTERFACE}/`);
    fenetre.maximize();
    fenetre.show();
    chargement.close();

    const marqueur = join(donnees, 'bienvenue-affichee');
    if (!existsSync(marqueur)) {
      writeFileSync(marqueur, '');
      dialog.showMessageBox(fenetre, {
        type: 'info',
        title: 'Bienvenue',
        message: 'Première utilisation',
        detail: `Connectez-vous avec :\n\nE-mail : ${COMPTE_INITIAL.email}\nMot de passe : ${COMPTE_INITIAL.motDePasse}\n\nPensez à changer ce mot de passe, puis à créer les comptes du personnel (Établissement > Utilisateurs).`,
      });
    }
  } catch (e) {
    journal(`ERREUR ${e.stack ?? e}`);
    chargement.close();
    dialog.showErrorBox('Mamé-TA ne peut pas démarrer', `${e.message ?? e}\n\nJournal : ${fichierJournal}`);
    await arreter();
    app.exit(1); // exit : sans repasser par before-quit
  }
}

async function arreter() {
  app.isQuitting = true;
  journal('Arrêt demandé');
  try {
    serveurInterface?.close();
  } catch {}
  try {
    backend?.kill();
  } catch {}
  // Laisse au serveur le temps de terminer une écriture en cours (SQLite en WAL reste cohérent dans tous les cas)
  if (backend && backend.exitCode === null) {
    await new Promise((resolve) => {
      backend.once('exit', resolve);
      setTimeout(resolve, 3000);
    });
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (fenetre) {
      if (fenetre.isMinimized()) fenetre.restore();
      fenetre.focus();
    }
  });
  app.whenReady().then(demarrer);
  app.on('window-all-closed', () => app.quit());
  // Arrêt du serveur avant de quitter
  app.on('before-quit', (e) => {
    if (arrete) return;
    e.preventDefault();
    arreter().finally(() => {
      arrete = true;
      app.quit();
    });
  });
}
