-- CreateEnum
CREATE TYPE "StatutDemandeInscription" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');

-- CreateTable
CREATE TABLE "demandes_inscription" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nomEleve" TEXT NOT NULL,
    "prenomEleve" TEXT NOT NULL,
    "genre" "Genre" NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "lieuNaissance" TEXT,
    "niveauId" TEXT,
    "niveauSouhaite" TEXT,
    "nomParent" TEXT NOT NULL,
    "prenomParent" TEXT NOT NULL,
    "telephoneParent" TEXT NOT NULL,
    "emailParent" TEXT,
    "piecesJointes" TEXT,
    "statut" "StatutDemandeInscription" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus" TEXT,
    "eleveId" TEXT,
    "traiteeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "demandes_inscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "demandes_inscription_ecoleId_statut_idx" ON "demandes_inscription"("ecoleId", "statut");

-- AddForeignKey
ALTER TABLE "demandes_inscription" ADD CONSTRAINT "demandes_inscription_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_inscription" ADD CONSTRAINT "demandes_inscription_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demandes_inscription" ADD CONSTRAINT "demandes_inscription_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE SET NULL ON UPDATE CASCADE;
