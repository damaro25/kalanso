-- Assurance scolaire : type de facture ASSURANCE et montant annuel par année (et par cycle)

-- AlterEnum
ALTER TYPE "TypeFacture" ADD VALUE 'ASSURANCE';

-- CreateTable
CREATE TABLE "tarifs_assurance" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT '',
    "montant" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tarifs_assurance_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tarifs_assurance_ecoleId_anneeScolaireId_cycle_key" ON "tarifs_assurance"("ecoleId", "anneeScolaireId", "cycle");

-- AddForeignKey
ALTER TABLE "tarifs_assurance" ADD CONSTRAINT "tarifs_assurance_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

