-- AlterTable
ALTER TABLE "classes" ALTER COLUMN "fraisInscription" DROP NOT NULL,
ALTER COLUMN "fraisInscription" DROP DEFAULT;

-- CreateTable
CREATE TABLE "frais_inscription_niveau" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "frais_inscription_niveau_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "frais_inscription_niveau_ecoleId_idx" ON "frais_inscription_niveau"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "frais_inscription_niveau_ecoleId_niveauId_anneeScolaireId_key" ON "frais_inscription_niveau"("ecoleId", "niveauId", "anneeScolaireId");

-- AddForeignKey
ALTER TABLE "frais_inscription_niveau" ADD CONSTRAINT "frais_inscription_niveau_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "frais_inscription_niveau" ADD CONSTRAINT "frais_inscription_niveau_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
