# Kalanso

Plateforme SaaS ERP de gestion scolaire pour les écoles privées guinéennes.

## Périmètre MVP

Administration/rôles, scolarité (élèves/classes), personnel, finances simples (écolage/paiements), absences, reporting direction. Voir `docs/plan_pilote_kalanso_la_cible.md` pour le détail du périmètre et `docs/SIGS_Architecture_LasCible.md` pour l'architecture cible long terme.

## Stack

- Backend : NestJS (TypeScript) + Prisma + PostgreSQL
- Frontend : Vite + React + TypeScript
- Multi-tenant : base unique, colonne `ecoleId` par table (pas de schema-per-tenant pour l'instant)

## Démarrage local

```bash
# 1. Base de données
docker-compose up -d

# 2. Backend
cd backend
npm install
npx prisma migrate dev --name init
npx prisma db seed
npm run start:dev

# 3. Frontend (dans un autre terminal)
cd frontend
npm install
npm run dev
```

Le backend écoute par défaut sur `http://localhost:3000`, le frontend sur `http://localhost:5173`.

Identifiants de démo créés par le seed : voir `backend/prisma/seed.ts`.
