# Déploiement de la version web sur un serveur Ubuntu

Ce guide installe « La cible du formateur » (version web) sur un serveur Ubuntu 22.04 ou 24.04, derrière Nginx, avec HTTPS.

État de vérification : les étapes de l'application (dépendances, `prisma generate`, compilation, `migrate deploy` sur une base vide, seed, démarrage du backend compilé, connexion et appels d'API, build du frontend avec `VITE_API_URL`) ont été rejouées sur un clone propre du dépôt. Les étapes propres au système (utilisateur, systemd, Nginx, Let's Encrypt, pare-feu, cron) sont des configurations standard mais n'ont pas pu être exécutées sur un vrai serveur Ubuntu : faites le premier déploiement sur une machine de test.

Dans tout le guide, remplacez `ecole.exemple.org` par votre nom de domaine.

## 1. Vue d'ensemble

```
Navigateur ──HTTPS──> Nginx (80/443)
                        ├── /        fichiers statiques du frontend (/opt/kalanso/frontend/dist)
                        └── /api/    proxy vers 127.0.0.1:3000 (NestJS, service systemd)
                                          └── PostgreSQL (127.0.0.1:5432)
```

- Une seule machine suffit : 2 vCPU, 2 Go de RAM, 20 Go de disque pour démarrer.
- Le backend n'écoute que sur la machine (via Nginx), jamais directement sur Internet.
- Le frontend est un site statique (PWA) compilé une fois. L'adresse de l'API est figée dans le build (variable `VITE_API_URL`).

## 2. Prérequis

- Un serveur Ubuntu avec un accès `sudo`.
- Un nom de domaine dont l'enregistrement DNS `A` pointe vers l'IP du serveur (nécessaire pour le certificat HTTPS).
- L'accès au dépôt Git du projet depuis le serveur (clé de déploiement ou jeton).

## 3. Préparer le serveur

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential ufw nginx

# Pare-feu : SSH et web uniquement
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable

# Utilisateur dédié, sans mot de passe de connexion
sudo adduser --system --group --home /opt/kalanso kalanso
```

## 4. Installer Node.js 22

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v    # doit afficher v22.x
```

## 5. Installer PostgreSQL et créer la base

```bash
sudo apt install -y postgresql
sudo -u postgres psql
```

Dans `psql` (choisissez un vrai mot de passe, sans apostrophe) :

```sql
CREATE USER kalanso WITH PASSWORD 'MOT_DE_PASSE_FORT';
CREATE DATABASE kalanso OWNER kalanso;
\q
```

PostgreSQL écoute par défaut sur `localhost` uniquement : laissez ce réglage.

## 6. Récupérer le code

```bash
sudo mkdir -p /opt/kalanso && sudo chown kalanso:kalanso /opt/kalanso
sudo -u kalanso git clone <URL_DU_DEPOT> /opt/kalanso
cd /opt/kalanso
```

## 7. Backend

### 7.1 Configuration

```bash
cd /opt/kalanso/backend
sudo -u kalanso cp .env.example .env
sudo -u kalanso nano .env
```

Contenu à renseigner :

```
DATABASE_URL="postgresql://kalanso:MOT_DE_PASSE_FORT@localhost:5432/kalanso"
JWT_SECRET="<chaîne aléatoire longue>"
JWT_EXPIRES_IN="8h"
PORT=3000
```

Générer le secret JWT : `openssl rand -hex 48`. Ne le changez plus ensuite, sinon toutes les sessions ouvertes sont invalidées.

Puis protégez le fichier :

```bash
sudo chmod 600 /opt/kalanso/backend/.env
```

### 7.2 Dépendances et compilation

```bash
cd /opt/kalanso/backend
sudo -u kalanso npm ci
sudo -u kalanso npm run build
```

Notes :
- `npm run build` génère d'abord le client Prisma (`prisma generate`, il n'est pas dans Git : dossier `src/generated`), puis compile. Cette génération lit `DATABASE_URL` : le fichier `.env` du 7.1 doit donc exister avant cette étape.
- Ne pas utiliser `npm ci --omit=dev` : la compilation et le seed ont besoin des dépendances de développement.
- Le programme compilé est `dist/src/main.js`. `npm run start:prod` le lance, mais le service ci-dessous appelle directement `node dist/src/main` pour ne pas dépendre de npm.

### 7.3 Base de données

```bash
cd /opt/kalanso/backend
sudo -u kalanso npx prisma migrate deploy
```

`migrate deploy` applique toutes les migrations existantes sans rien régénérer. C'est la seule commande de migration à utiliser en production (jamais `migrate dev`).

### 7.4 Premier démarrage : la première école

La version web n'a pas d'écran d'installation. Le seed crée une école de démonstration et 5 comptes :

```bash
cd /opt/kalanso/backend
sudo -u kalanso npx prisma db seed
```

Comptes créés, tous avec le mot de passe `kalanso2026` :

| Rôle | Email |
|---|---|
| Fondateur | fondateur@kalanso.gn |
| Chef d'établissement | chef@kalanso.gn |
| Secrétaire | secretaire@kalanso.gn |
| Comptable | comptable@kalanso.gn |
| Enseignant | enseignant@kalanso.gn |

**Dès la première connexion, changez ces mots de passe** (menu Établissement, Utilisateurs, modifier le compte, nouveau mot de passe), et désactivez les comptes dont vous n'avez pas besoin. Le seed crée aussi quelques élèves et classes de démonstration. Le compte enseignant du seed n'est relié à aucune fiche du personnel : il ne voit aucune classe tant qu'on ne l'a pas relié à une fiche d'enseignant (écran Utilisateurs).

Le seed peut être relancé sans danger (il fait des « upsert »), mais ne le relancez pas en production une fois l'école configurée.

### 7.5 Service systemd

Créez `/etc/systemd/system/kalanso.service` :

```ini
[Unit]
Description=La cible du formateur (API)
After=network.target postgresql.service

[Service]
Type=simple
User=kalanso
Group=kalanso
WorkingDirectory=/opt/kalanso/backend
ExecStart=/usr/bin/node dist/src/main
Environment=NODE_ENV=production
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Le `WorkingDirectory` compte : le fichier `.env` est lu depuis ce dossier, et les fichiers déposés (photos des élèves, pièces d'admission) sont écrits dans `uploads/` à partir de ce même dossier.

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now kalanso
sudo systemctl status kalanso          # doit afficher « active (running) »
journalctl -u kalanso -f               # journaux en direct
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/    # 200
```

## 8. Frontend

```bash
cd /opt/kalanso/frontend
sudo -u kalanso npm ci
sudo -u kalanso env VITE_API_URL=https://ecole.exemple.org/api npm run build
```

Le résultat est dans `/opt/kalanso/frontend/dist`. Si vous changez de domaine plus tard, il faut recompiler : l'adresse est écrite dans les fichiers générés.

## 9. Nginx

Créez `/etc/nginx/sites-available/kalanso` :

```nginx
server {
    listen 80;
    server_name ecole.exemple.org;

    root /opt/kalanso/frontend/dist;
    index index.html;

    # Photos (2 Mo max) et pièces d'admission : on laisse de la marge
    client_max_body_size 12m;

    # Application (PWA) : toujours revalider la page et le service worker
    location = /index.html { add_header Cache-Control "no-cache"; }
    location = /sw.js      { add_header Cache-Control "no-cache"; }

    location / {
        try_files $uri $uri/ /index.html;
    }

    # API : le préfixe /api est retiré avant d'arriver au backend (barre finale obligatoire)
    location /api/ {
        proxy_pass http://127.0.0.1:3000/;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;    # planches de cartes scolaires et exports PDF volumineux
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kalanso /etc/nginx/sites-enabled/kalanso
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

Nginx doit pouvoir lire le dossier du frontend. Si vous obtenez une erreur 403, vérifiez que `/opt/kalanso` est traversable : `sudo chmod 755 /opt/kalanso`.

## 10. HTTPS (Let's Encrypt)

```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d ecole.exemple.org
```

Certbot ajoute la redirection HTTP vers HTTPS et renouvelle le certificat automatiquement (`systemctl list-timers | grep certbot`).

## 11. Vérification

1. `https://ecole.exemple.org` affiche la page de connexion.
2. Connexion avec `fondateur@kalanso.gn`, puis changement du mot de passe.
3. Le tableau de bord se charge, la liste des élèves s'affiche.
4. Dans un élève, ajoutez une photo : le fichier doit apparaître dans `/opt/kalanso/backend/uploads/photos-eleves/`.
5. Générez une carte scolaire en PDF.
6. Sur un téléphone, ouvrez le site : le navigateur propose « Installer l'application ».

## 12. Sauvegardes

Deux choses à sauvegarder : la base PostgreSQL et le dossier `uploads/`. Créez `/etc/cron.daily/kalanso-sauvegarde` (puis `sudo chmod +x`) :

```bash
#!/bin/bash
set -e
DEST=/var/backups/kalanso
mkdir -p "$DEST"
DATE=$(date +%F)
sudo -u postgres pg_dump -Fc kalanso > "$DEST/base-$DATE.dump"
tar -czf "$DEST/uploads-$DATE.tar.gz" -C /opt/kalanso/backend uploads 2>/dev/null || true
# Garder 14 jours
find "$DEST" -type f -mtime +14 -delete
```

Copiez régulièrement `/var/backups/kalanso` hors du serveur (autre machine, stockage objet). Une sauvegarde qui reste sur le même disque ne protège pas d'une panne du serveur.

Restauration de la base :

```bash
sudo systemctl stop kalanso
sudo -u postgres dropdb kalanso && sudo -u postgres createdb -O kalanso kalanso
sudo -u postgres pg_restore -d kalanso /var/backups/kalanso/base-AAAA-MM-JJ.dump
sudo systemctl start kalanso
```

## 13. Mettre à jour l'application

```bash
cd /opt/kalanso
# 1. Sauvegarde avant toute migration
sudo -u postgres pg_dump -Fc kalanso > /var/backups/kalanso/avant-maj-$(date +%F-%H%M).dump

# 2. Nouveau code
sudo -u kalanso git pull

# 3. Backend
cd backend
sudo -u kalanso npm ci
sudo -u kalanso npm run build
sudo -u kalanso npx prisma migrate deploy
sudo systemctl restart kalanso

# 4. Frontend
cd ../frontend
sudo -u kalanso npm ci
sudo -u kalanso env VITE_API_URL=https://ecole.exemple.org/api npm run build
```

Les utilisateurs récupèrent la nouvelle version du frontend à leur prochaine ouverture (mise à jour automatique du service worker).

## 14. Dépannage

| Symptôme | Cause probable | Action |
|---|---|---|
| `npm run build` ou `migrate deploy` : « DATABASE_URL » introuvable | `.env` absent ou mal placé | Le fichier doit être dans `/opt/kalanso/backend/.env` |
| Centaines d'erreurs TypeScript à la compilation | Client Prisma absent (compilation lancée avec `npx nest build` au lieu de `npm run build`) | Lancer `npm run build` |
| Le service redémarre en boucle | Erreur au démarrage | `journalctl -u kalanso -n 100` (base inaccessible, mauvais mot de passe, port occupé) |
| `EADDRINUSE :::3000` | Un autre processus utilise le port | `sudo ss -ltnp \| grep 3000`, arrêter l'autre processus ou changer `PORT` |
| La page de connexion s'affiche mais la connexion échoue | `VITE_API_URL` faux au moment du build | Recompiler le frontend avec la bonne adresse |
| 502 Bad Gateway | Backend arrêté | `systemctl status kalanso` |
| 413 à l'envoi d'une photo | `client_max_body_size` absent | Voir la configuration Nginx |
| Le frontend reste sur l'ancienne version | Cache du service worker | Recharger en vidant le cache, ou fermer tous les onglets puis rouvrir |

## 15. Points de sécurité à ne pas oublier

- Changer les mots de passe du seed avant d'ouvrir le site aux utilisateurs.
- `JWT_SECRET` unique, long et secret. `.env` en lecture seule pour l'utilisateur `kalanso` (`chmod 600`).
- Les envois de SMS et de Mobile Money sont simulés dans cette version : rien ne part réellement vers les opérateurs.
- Mettre à jour régulièrement le système : `sudo apt update && sudo apt upgrade`, et activer `unattended-upgrades` pour les correctifs de sécurité.
