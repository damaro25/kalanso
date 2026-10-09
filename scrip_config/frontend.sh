#!/usr/bin/env bash
# Build du frontend Kalanso + configuration Apache. Rejouable sans risque.
# Prérequis : install-backend.sh déjà exécuté (Node.js, Apache, backend sur 127.0.0.1:3000).
# Usage : sudo bash /var/www/kalanso/deploy/install-frontend.sh
set -euo pipefail

DOMAIN=ecole1.lacibleduformateur.org
APP_DIR=/var/www/kalanso
FRONTEND=$APP_DIR/frontend
WEB_ROOT=/var/www/kalanso-web
SITE=/etc/apache2/sites-available/kalanso.conf

[ "$(id -u)" -eq 0 ] || { echo "Lancer avec sudo"; exit 1; }
[ -f "$FRONTEND/package.json" ] || { echo "Projet introuvable : $FRONTEND"; exit 1; }
command -v npm >/dev/null || { echo "npm absent : lancer d'abord install-backend.sh"; exit 1; }

# 1. Build du frontend
cd "$FRONTEND"
rm -rf dist
npm install --package-lock-only --no-audit --no-fund
npm ci --no-audit --no-fund
VITE_API_URL=/api npm run build
[ -f dist/index.html ] || { echo "Build échoué : dist/index.html absent"; exit 1; }

# 2. Publication dans un dossier distinct du projet (rsync --delete effacerait le projet sinon)
case "$WEB_ROOT/" in
  "$APP_DIR"/*) echo "WEB_ROOT ne doit pas être dans $APP_DIR"; exit 1 ;;
esac
install -d -m 0755 "$WEB_ROOT"
rsync -a --delete dist/ "$WEB_ROOT/"
chown -R root:root "$WEB_ROOT"

# 3. Modules et sécurité Apache
a2enmod proxy proxy_http headers dir
sed -i 's/^ServerTokens .*/ServerTokens Prod/; s/^ServerSignature .*/ServerSignature Off/' /etc/apache2/conf-available/security.conf

# 4. Site Apache (${APACHE_LOG_DIR} est volontairement laissé à Apache)
# shellcheck disable=SC2016
printf '%s\n' \
  '<VirtualHost *:80>' \
  "    ServerName $DOMAIN" \
  "    DocumentRoot $WEB_ROOT" \
  '    LimitRequestBody 12582912' \
  '    ProxyPreserveHost On' \
  '    ProxyTimeout 120' \
  '    ProxyPass        /api/ http://127.0.0.1:3000/' \
  '    ProxyPassReverse /api/ http://127.0.0.1:3000/' \
  '    RequestHeader set X-Forwarded-Proto "http"' \
  "    <Directory $WEB_ROOT>" \
  '        Options -Indexes' \
  '        AllowOverride None' \
  '        Require all granted' \
  '        FallbackResource /index.html' \
  '    </Directory>' \
  '    Header set X-Content-Type-Options "nosniff"' \
  '    Header set Referrer-Policy "strict-origin-when-cross-origin"' \
  '    Header set Cache-Control "no-cache"' \
  '    <Location /assets/>' \
  '        Header set Cache-Control "public, max-age=31536000, immutable"' \
  '    </Location>' \
  '    ErrorLog ${APACHE_LOG_DIR}/kalanso_error.log' \
  '    CustomLog ${APACHE_LOG_DIR}/kalanso_access.log combined' \
  '</VirtualHost>' \
  > "$SITE"

# 5. Un seul site actif pour ce domaine
for old in 000-default "$DOMAIN"; do
  if [ -e "/etc/apache2/sites-enabled/$old.conf" ]; then
    a2dissite "$old"
  fi
done
a2ensite kalanso

# 6. Validation puis redémarrage
apache2ctl configtest
systemctl enable apache2
systemctl restart apache2

# 7. Vérifications (via Apache, sans dépendre du DNS)
check() {
  local path="$1" expected="$2" code
  code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $DOMAIN" "http://127.0.0.1$path")
  printf '%-16s %s (attendu %s)\n' "$path" "$code" "$expected"
  [ "$code" = "$expected" ]
}
ok=1
check / 200 || ok=0
check /eleves 200 || ok=0
check /api/ 200 || ok=0
if curl -s -H "Host: $DOMAIN" http://127.0.0.1/backend/.env | grep -q DATABASE_URL; then
  echo "DANGER : backend/.env est accessible depuis le web"
  ok=0
fi
if [ "$ok" -eq 1 ]; then
  echo "Frontend OK : http://$DOMAIN"
else
  tail -n 20 /var/log/apache2/kalanso_error.log || true
  echo "Vérification échouée"
  exit 1
fi
