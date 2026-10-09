#!/usr/bin/env bash
# Installation / mise à jour du backend Kalanso. Rejouable sans risque.
# Usage : sudo bash /var/www/kalanso/deploy/install-backend.sh
set -euo pipefail

APP_DIR=/var/www/kalanso
BACKEND=$APP_DIR/backend
SECRETS=/etc/kalanso/secrets.env

[ "$(id -u)" -eq 0 ] || { echo "Lancer avec sudo"; exit 1; }
[ -f "$BACKEND/package.json" ] || { echo "Projet introuvable : $BACKEND"; exit 1; }

# 1. Paquets système
apt-get update
apt-get install -y apache2 postgresql rsync curl ca-certificates openssl gnupg
systemctl enable --now postgresql
for _ in $(seq 1 30); do
  pg_isready -q && break
  sleep 1
done
pg_isready || { echo "PostgreSQL ne démarre pas"; exit 1; }

# 2. Node.js 24
install -d -m 0755 /etc/apt/keyrings
curl -fsSL --retry 5 --retry-all-errors https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_24.x nodistro main" > /etc/apt/sources.list.d/nodesource.list
printf 'Package: nodejs\nPin: origin deb.nodesource.com\nPin-Priority: 600\n' > /etc/apt/preferences.d/nodesource
apt-get update
apt-get install -y nodejs
node -v
npm -v
npm config set fetch-retries 6
npm config set fetch-retry-mintimeout 20000
npm config set fetch-retry-maxtimeout 120000

# 3. Utilisateur système (si absent)
id kalanso >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin kalanso

# 4. Secrets (générés une seule fois)
install -d -m 0700 /etc/kalanso
if [ ! -f "$SECRETS" ]; then
  printf 'DB_PASS=%s\nJWT_SECRET=%s\n' "$(openssl rand -hex 24)" "$(openssl rand -hex 48)" > "$SECRETS"
  chmod 600 "$SECRETS"
fi
DB_PASS=$(grep '^DB_PASS=' "$SECRETS" | cut -d= -f2)
JWT_SECRET=$(grep '^JWT_SECRET=' "$SECRETS" | cut -d= -f2)
if [ "${#DB_PASS}" -lt 24 ] || [ "${#JWT_SECRET}" -lt 32 ]; then
  echo "Secrets invalides dans $SECRETS"
  exit 1
fi

# 5. Rôle et base PostgreSQL (créés si absents, mot de passe toujours resynchronisé)
cd /tmp
if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='kalanso'" | grep -q 1; then
  sudo -u postgres psql -c "ALTER ROLE kalanso WITH LOGIN PASSWORD '$DB_PASS';"
else
  sudo -u postgres psql -c "CREATE ROLE kalanso LOGIN PASSWORD '$DB_PASS';"
fi
if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='kalanso'" | grep -q 1; then
  sudo -u postgres psql -c "CREATE DATABASE kalanso OWNER kalanso;"
fi
PGPASSWORD="$DB_PASS" psql -h localhost -U kalanso -d kalanso -tAc "SELECT 'connexion base OK';"

# 6. Configuration du backend
cd "$BACKEND"
grep -q '"include"' tsconfig.build.json || sed -i 's#"extends": "./tsconfig.json",#"extends": "./tsconfig.json",\n  "include": ["src"],#' tsconfig.build.json
printf 'DATABASE_URL="postgresql://kalanso:%s@localhost:5432/kalanso"\nJWT_SECRET="%s"\nJWT_EXPIRES_IN="8h"\nPORT=3000\n' "$DB_PASS" "$JWT_SECRET" > .env
chown root:kalanso .env
chmod 640 .env

# 7. Build
rm -rf dist src/generated
npm install --package-lock-only --no-audit --no-fund
npm ci --no-audit --no-fund
npx prisma generate
npm run build
[ -f dist/main.js ] || { echo "Build échoué : dist/main.js absent"; exit 1; }

# 8. Base : migrations + données de démo (une seule fois)
npx prisma migrate deploy
if [ ! -f /etc/kalanso/.seeded ]; then
  npx prisma db seed
  touch /etc/kalanso/.seeded
fi

# 9. Dossier des documents envoyés
mkdir -p "$BACKEND/uploads/admissions"
chown -R kalanso:kalanso "$BACKEND/uploads"
chmod 750 "$BACKEND/uploads"

# 10. Service systemd
printf '%s\n' \
  '[Unit]' \
  'Description=Kalanso backend (NestJS)' \
  'After=network.target postgresql.service' \
  'Requires=postgresql.service' \
  '' \
  '[Service]' \
  'User=kalanso' \
  'Group=kalanso' \
  "WorkingDirectory=$BACKEND" \
  'Environment=NODE_ENV=production' \
  'ExecStart=/usr/bin/node dist/main.js' \
  'Restart=always' \
  'RestartSec=5' \
  'NoNewPrivileges=true' \
  'PrivateTmp=true' \
  'ProtectSystem=strict' \
  'ProtectHome=true' \
  "ReadWritePaths=$BACKEND/uploads" \
  '' \
  '[Install]' \
  'WantedBy=multi-user.target' \
  > /etc/systemd/system/kalanso-backend.service
systemctl daemon-reload
systemctl enable kalanso-backend
systemctl restart kalanso-backend

# 11. Vérification
for _ in $(seq 1 30); do
  curl -fs http://127.0.0.1:3000/ >/dev/null && break
  sleep 1
done
if curl -fs http://127.0.0.1:3000/ >/dev/null; then
  echo "Backend OK : $(curl -s http://127.0.0.1:3000/)"
else
  journalctl -u kalanso-backend -n 50 --no-pager
  echo "Le backend ne répond pas"
  exit 1
fi
