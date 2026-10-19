-- Formations supplémentaires (arabe, anglais, informatique...) : catalogue, inscriptions des élèves, factures au mois

-- AlterEnum
ALTER TYPE "TypeFacture" ADD VALUE 'FORMATION';

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "formationId" TEXT,
ADD COLUMN     "moisFormation" TEXT;

-- CreateTable
CREATE TABLE "formations_supplementaires" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "tarifMensuel" INTEGER NOT NULL DEFAULT 0,
    "regimesGratuits" "Regime"[],
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "formations_supplementaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscriptions_formations" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inscriptions_formations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "formations_supplementaires_ecoleId_nom_key" ON "formations_supplementaires"("ecoleId", "nom");

-- CreateIndex
CREATE INDEX "inscriptions_formations_ecoleId_anneeScolaireId_idx" ON "inscriptions_formations"("ecoleId", "anneeScolaireId");

-- CreateIndex
CREATE UNIQUE INDEX "inscriptions_formations_eleveId_formationId_anneeScolaireId_key" ON "inscriptions_formations"("eleveId", "formationId", "anneeScolaireId");

-- CreateIndex
CREATE UNIQUE INDEX "factures_eleveId_formationId_moisFormation_key" ON "factures"("eleveId", "formationId", "moisFormation");

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations_supplementaires"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "formations_supplementaires" ADD CONSTRAINT "formations_supplementaires_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_formations" ADD CONSTRAINT "inscriptions_formations_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_formations" ADD CONSTRAINT "inscriptions_formations_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_formations" ADD CONSTRAINT "inscriptions_formations_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations_supplementaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions_formations" ADD CONSTRAINT "inscriptions_formations_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

