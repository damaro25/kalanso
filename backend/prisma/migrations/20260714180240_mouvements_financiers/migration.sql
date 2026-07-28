-- CreateEnum
CREATE TYPE "TypeMouvement" AS ENUM ('RECETTE', 'DEPENSE');

-- CreateTable
CREATE TABLE "mouvements_financiers" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "type" "TypeMouvement" NOT NULL,
    "categorie" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "modePaiement" TEXT,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mouvements_financiers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mouvements_financiers_ecoleId_date_idx" ON "mouvements_financiers"("ecoleId", "date");

-- CreateIndex
CREATE INDEX "mouvements_financiers_ecoleId_type_idx" ON "mouvements_financiers"("ecoleId", "type");

-- AddForeignKey
ALTER TABLE "mouvements_financiers" ADD CONSTRAINT "mouvements_financiers_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
