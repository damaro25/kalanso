-- Identifiants (facultatifs) de la base PostgreSQL du serveur, saisis dans la version bureau
ALTER TABLE "sync_config" ADD COLUMN "bdHote" TEXT,
ADD COLUMN "bdPort" INTEGER,
ADD COLUMN "bdNom" TEXT,
ADD COLUMN "bdUtilisateur" TEXT,
ADD COLUMN "bdMotDePasseChiffre" TEXT;
