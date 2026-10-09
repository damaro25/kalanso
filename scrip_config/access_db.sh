#!/bin/bash
####
## Karamo Camara Dev-Sec-Ops
###
# Accès distant à PostgreSQL pour la base Kalanso (base et utilisateur déjà créés).
# Usage : sudo ALLOWED_CIDR=<votre_ip>/32 bash postgres-remote-access.sh
set -euo pipefail

DB_NAME="kalanso"
DB_USER="kalanso"
SECRETS="/etc/kalanso/secrets.env"
ALLOWED_CIDR="${ALLOWED_CIDR:-}"

log() {
    echo -e "\e[1;32m[INFO] $1\e[0m"
}

error_exit() {
    echo -e "\e[1;31m[ERREUR] $1\e[0m" >&2
    exit 1
}

check_prerequisites() {
    log "Vérification des prérequis..."
    [ "$(id -u)" -eq 0 ] || error_exit "Lancer avec sudo."
    [ -n "$ALLOWED_CIDR" ] || error_exit "Indiquer l'IP autorisée : sudo ALLOWED_CIDR=86.107.197.236/24 bash $0"
    command -v psql &>/dev/null || error_exit "PostgreSQL n'est pas installé."
    [ -f "$SECRETS" ] || error_exit "$SECRETS introuvable."
    DB_PASSWORD=$(grep '^DB_PASS=' "$SECRETS" | cut -d= -f2)
    [ -n "$DB_PASSWORD" ] || error_exit "DB_PASS vide dans $SECRETS."
}

start_postgresql() {
    log "Démarrage de PostgreSQL..."
    systemctl enable --now postgresql || error_exit "Échec du démarrage de PostgreSQL."
    for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
    pg_isready -q || error_exit "PostgreSQL ne répond pas."
    cd /tmp
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 \
        || error_exit "L'utilisateur $DB_USER n'existe pas (lancer d'abord install-backend.sh)."
    sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
        || error_exit "La base $DB_NAME n'existe pas (lancer d'abord install-backend.sh)."
}

configure_remote_access() {
    log "Configuration de l'accès distant..."
    HBA_CONF=$(sudo -u postgres psql -tAc "SHOW hba_file;")
    log "Fichier pg_hba.conf : $HBA_CONF"

    sudo -u postgres psql -c "ALTER SYSTEM SET listen_addresses = '*';" || error_exit "Échec listen_addresses."

    RULE="hostssl ${DB_NAME} ${DB_USER} ${ALLOWED_CIDR} scram-sha-256"
    if grep -qxF "$RULE" "$HBA_CONF"; then
        log "Règle déjà présente : $RULE"
    else
        echo "$RULE" >> "$HBA_CONF"
        log "Règle ajoutée : $RULE"
    fi

    [ "$(sudo -u postgres psql -tAc 'SHOW ssl;')" = "on" ] || error_exit "SSL désactivé dans PostgreSQL."
}

restart_postgresql() {
    log "Redémarrage de PostgreSQL..."
    systemctl restart postgresql || error_exit "Échec du redémarrage."
    for _ in $(seq 1 30); do pg_isready -q && break; sleep 1; done
    pg_isready -q || error_exit "PostgreSQL ne redémarre pas."
}

configure_firewall() {
    if command -v ufw &>/dev/null && ufw status | grep -q "Status: active"; then
        log "Ouverture du port 5432 pour $ALLOWED_CIDR..."
        ufw allow from "$ALLOWED_CIDR" to any port 5432 proto tcp || error_exit "Échec ouverture du port 5432."
    else
        log "UFW inactif : rien à ouvrir."
    fi
}

test_connection() {
    log "Vérification..."
    ss -ltn | grep -qE '(0\.0\.0\.0|\*|\[::\]):5432' || error_exit "PostgreSQL n'écoute pas sur toutes les interfaces."
    PGPASSWORD="$DB_PASSWORD" psql -h 127.0.0.1 -U "$DB_USER" -d "$DB_NAME" -tAc "SELECT 'mot de passe OK';" \
        || error_exit "Échec de connexion avec le mot de passe de $SECRETS."
}

show_connection_info() {
    log "Paramètres de connexion distante :"
    echo "  Hôte        : $(hostname -I | awk '{print $1}') (ou ecole1.lacibleduformateur.org)"
    echo "  Port        : 5432"
    echo "  Base        : $DB_NAME"
    echo "  Utilisateur : $DB_USER"
    echo "  Mot de passe: valeur DB_PASS dans $SECRETS"
    echo "  SSL         : require"
    echo "  Autorisé    : $ALLOWED_CIDR"
}

check_prerequisites
start_postgresql
configure_remote_access
restart_postgresql
configure_firewall
test_connection
show_connection_info

log "Accès distant PostgreSQL configuré !"