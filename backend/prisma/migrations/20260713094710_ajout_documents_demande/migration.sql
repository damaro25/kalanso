-- CreateEnum
CREATE TYPE "TypeDocument" AS ENUM ('ATTESTATION', 'RELEVE_NOTES', 'EXTRAIT_NAISSANCE', 'AUTRE');

-- CreateEnum
CREATE TYPE "StatutVerificationDocument" AS ENUM ('EN_ATTENTE', 'VERIFIE', 'REJETE');

-- CreateTable
CREATE TABLE "documents_demande" (
    "id" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "type" "TypeDocument" NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminFichier" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "statut" "StatutVerificationDocument" NOT NULL DEFAULT 'EN_ATTENTE',
    "commentaire" TEXT,
    "verifieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_demande_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_demande_demandeId_idx" ON "documents_demande"("demandeId");

-- AddForeignKey
ALTER TABLE "documents_demande" ADD CONSTRAINT "documents_demande_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes_inscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
