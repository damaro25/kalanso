-- CreateEnum
CREATE TYPE "CategorieMateriel" AS ENUM ('MOBILIER', 'INFORMATIQUE', 'PEDAGOGIQUE', 'AUTRE');

-- CreateEnum
CREATE TYPE "EtatMateriel" AS ENUM ('BON', 'MOYEN', 'A_REPARER', 'HORS_SERVICE');

-- CreateTable
CREATE TABLE "materiels" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "categorie" "CategorieMateriel" NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "etat" "EtatMateriel" NOT NULL DEFAULT 'BON',
    "salleId" TEXT,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "materiels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "materiels_ecoleId_categorie_idx" ON "materiels"("ecoleId", "categorie");

-- CreateIndex
CREATE INDEX "materiels_salleId_idx" ON "materiels"("salleId");

-- AddForeignKey
ALTER TABLE "materiels" ADD CONSTRAINT "materiels_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "materiels" ADD CONSTRAINT "materiels_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "salles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
