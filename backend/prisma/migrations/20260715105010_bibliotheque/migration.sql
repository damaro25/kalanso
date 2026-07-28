-- CreateEnum
CREATE TYPE "StatutEmprunt" AS ENUM ('EN_COURS', 'RETOURNE');

-- CreateTable
CREATE TABLE "livres" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "auteur" TEXT,
    "isbn" TEXT,
    "categorie" TEXT,
    "quantiteTotale" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "livres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emprunts" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "livreId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "dateEmprunt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRetourPrevue" TIMESTAMP(3) NOT NULL,
    "dateRetourEffective" TIMESTAMP(3),
    "statut" "StatutEmprunt" NOT NULL DEFAULT 'EN_COURS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emprunts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "livres_ecoleId_idx" ON "livres"("ecoleId");

-- CreateIndex
CREATE INDEX "emprunts_ecoleId_statut_idx" ON "emprunts"("ecoleId", "statut");

-- CreateIndex
CREATE INDEX "emprunts_livreId_idx" ON "emprunts"("livreId");

-- CreateIndex
CREATE INDEX "emprunts_eleveId_idx" ON "emprunts"("eleveId");

-- AddForeignKey
ALTER TABLE "livres" ADD CONSTRAINT "livres_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_livreId_fkey" FOREIGN KEY ("livreId") REFERENCES "livres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "emprunts" ADD CONSTRAINT "emprunts_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
