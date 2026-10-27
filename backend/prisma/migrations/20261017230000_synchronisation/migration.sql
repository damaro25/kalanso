-- Synchronisation version bureau ↔ serveur : état des lignes, historique des conflits, postes, réglages.
CREATE TABLE "sync_etats" (
    "id" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "supprime" BOOLEAN NOT NULL DEFAULT false,
    "origine" TEXT NOT NULL,
    "modifieLe" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sync_etats_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sync_etats_modele_ligneId_key" ON "sync_etats"("modele", "ligneId");
CREATE INDEX "sync_etats_version_idx" ON "sync_etats"("version");

CREATE TABLE "sync_historique" (
    "id" TEXT NOT NULL,
    "modele" TEXT NOT NULL,
    "ligneId" TEXT NOT NULL,
    "donnees" JSONB,
    "modifieLe" TIMESTAMP(3) NOT NULL,
    "poste" TEXT,
    "raison" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_historique_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sync_historique_modele_ligneId_idx" ON "sync_historique"("modele", "ligneId");

CREATE TABLE "sync_postes" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "nom" TEXT,
    "derniereSyncLe" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sync_postes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sync_postes_ecoleId_code_key" ON "sync_postes"("ecoleId", "code");
CREATE UNIQUE INDEX "sync_postes_ecoleId_numero_key" ON "sync_postes"("ecoleId", "numero");

CREATE TABLE "sync_config" (
    "id" TEXT NOT NULL,
    "urlServeur" TEXT,
    "email" TEXT,
    "motDePasseChiffre" TEXT,
    "poste" TEXT,
    "posteNumero" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT false,
    "initialise" BOOLEAN NOT NULL DEFAULT false,
    "curseurServeur" INTEGER NOT NULL DEFAULT 0,
    "versionEnvoyee" INTEGER NOT NULL DEFAULT 0,
    "derniereSyncLe" TIMESTAMP(3),
    "dernierEtat" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sync_config_pkey" PRIMARY KEY ("id")
);

-- Reçus des postes bureau : chaque poste a sa série (poste n : numéros n×1 000 000 + 1, imprimés « Bn-000001 »).
-- La série du serveur (web) ne compte que ses propres numéros, sous 1 000 000.
CREATE OR REPLACE FUNCTION numeroter_paiement() RETURNS trigger AS $$
BEGIN
  IF NEW."numero" IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('numero_recu:' || NEW."ecoleId"));
    SELECT GREATEST(
      COALESCE(MAX("numero"), 0) + 1,
      COALESCE((SELECT "numeroRecuDepart" FROM "ecoles" WHERE "id" = NEW."ecoleId"), 1)
    ) INTO NEW."numero"
    FROM "paiements" WHERE "ecoleId" = NEW."ecoleId" AND "numero" < 1000000;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
