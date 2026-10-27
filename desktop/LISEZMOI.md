# Version bureau (Windows)

Application Mamé-TA installable sur un PC Windows, sans rien d'autre à installer : la base de données (SQLite,
un simple fichier), le serveur et l'interface sont embarqués. La version serveur / web reste sur PostgreSQL.

## Construire l'installateur

```bash
cd desktop
npm install
npm run installateur
```

L'installateur est créé dans `desktop/sortie/` (`Mamé-TA Gestion scolaire Setup x.y.z.exe`). Il propose le
dossier d'installation et crée un raccourci sur le bureau et dans le menu Démarrer. Installation silencieuse :
`"Mamé-TA Gestion scolaire Setup x.y.z.exe" /S`.

Pour essayer sans installer : `npm run preparer` puis `npm run demarrer`.

## Comment le backend passe sur SQLite

`scripts/preparer.mjs` copie le backend dans `build/backend-src`, convertit son schéma Prisma pour SQLite
(`scripts/schema-sqlite.mjs` : fournisseur sqlite, types `@db.*` retirés, listes `Regime[]` / `Decimal[]` en JSON),
génère le client Prisma SQLite et compile. Le dossier `backend/` n'est pas modifié. Au démarrage, le backend choisit
l'adaptateur selon `DATABASE_URL` (`file:` → SQLite, sinon PostgreSQL), voir `backend/src/prisma/prisma.service.ts`.

Migrations SQLite : `prisma-sqlite/migrations` (à conserver dans git). Quand le schéma du backend change, la
prochaine préparation crée la migration SQLite correspondante ; la version bureau l'applique au lancement.

Le code du backend doit rester compatible avec les deux bases : pas de `mode: 'insensitive'`, pas de
`createMany({ skipDuplicates })`, SQL brut portable, champs liste lus avec `liste()` (`src/common/liste.util.ts`).

## Données

Tout est dans `%APPDATA%\Mamé-TA Gestion scolaire\donnees` : la base (`mameta.db`), les documents et photos
(`uploads`), le journal (`journal.txt`) et le secret du poste (`configuration.json`). Ce dossier est conservé en
cas de désinstallation ou de mise à jour ; pour sauvegarder, copiez-le application fermée. La sauvegarde
automatique avant clôture d'année copie `mameta.db` dans `sauvegardes`.

Premier lancement sur une base vide : compte `fondateur@mameta.gn`, mot de passe `mameta2026` (à changer).

## Reprendre les données de la version serveur

Sur le PC où tournent le backend et sa base PostgreSQL, version bureau fermée, après `npm run preparer` :

```bash
node scripts/copier-donnees.mjs
```

La base PostgreSQL de `backend/.env` est seulement lue ; la base bureau est sauvegardée
(`mameta-avant-import-….db`) puis remplacée ; `backend/uploads` est copié. `node scripts/verifier-base.cjs <dossier>`
lance le backend sur une base copiée et appelle les pages principales.
