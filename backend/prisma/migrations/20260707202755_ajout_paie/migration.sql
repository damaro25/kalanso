-- CreateEnum
CREATE TYPE "StatutBulletinPaie" AS ENUM ('BROUILLON', 'VALIDE', 'PAYE');

-- AlterTable
ALTER TABLE "personnels" ADD COLUMN     "salaireBase" DECIMAL(12,2);

-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "nombreHeures" INTEGER,
    "totalGains" DECIMAL(12,2) NOT NULL,
    "totalRetenues" DECIMAL(12,2) NOT NULL,
    "netAPayer" DECIMAL(12,2) NOT NULL,
    "statut" "StatutBulletinPaie" NOT NULL DEFAULT 'BROUILLON',
    "modePaiement" TEXT,
    "creeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lignes_bulletin_paie" (
    "id" TEXT NOT NULL,
    "bulletinPaieId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "imposable" BOOLEAN NOT NULL DEFAULT false,
    "montantGain" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantRetenue" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lignes_bulletin_paie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "bulletins_paie_ecoleId_annee_mois_idx" ON "bulletins_paie"("ecoleId", "annee", "mois");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_personnelId_mois_annee_key" ON "bulletins_paie"("personnelId", "mois", "annee");

-- CreateIndex
CREATE INDEX "lignes_bulletin_paie_bulletinPaieId_idx" ON "lignes_bulletin_paie"("bulletinPaieId");

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bulletins_paie" ADD CONSTRAINT "bulletins_paie_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lignes_bulletin_paie" ADD CONSTRAINT "lignes_bulletin_paie_bulletinPaieId_fkey" FOREIGN KEY ("bulletinPaieId") REFERENCES "bulletins_paie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
