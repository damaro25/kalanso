-- CreateTable
CREATE TABLE "sync_etats" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modele" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "origine" TEXT NOT NULL,
    "modifieLe" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "sync_historique" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "modele" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "donnees" JSONB,
    "modifieLe" DATETIME NOT NULL,
    "poste" TEXT,
    "raison" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sync_postes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom" TEXT,
    "derniereSyncLe" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "sync_config" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "urlServeur" TEXT,
    "email" TEXT,
    "motDePasseChiffre" TEXT,
    "poste" TEXT,
    "posteNumero" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "initialise" BOOLEAN NOT NULL DEFAULT false,
    "curseurServeur" INTEGER NOT NULL DEFAULT 0,
    "versionEnvoyee" INTEGER NOT NULL DEFAULT 0,
    "derniereSyncLe" DATETIME,
    "dernierEtat" TEXT,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "sync_etats_version_idx" ON "sync_etats"("version");

-- CreateIndex
CREATE UNIQUE INDEX "sync_etats_modele_ligneId_key" ON "sync_etats"("modele", "ligneId");

-- CreateIndex
CREATE INDEX "sync_historique_modele_ligneId_idx" ON "sync_historique"("modele", "ligneId");

-- CreateIndex
CREATE UNIQUE INDEX "sync_postes_ecoleId_code_key" ON "sync_postes"("ecoleId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "sync_postes_ecoleId_numero_key" ON "sync_postes"("ecoleId", "numero");
