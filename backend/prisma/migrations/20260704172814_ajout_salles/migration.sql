-- AlterTable
ALTER TABLE "creneaux" ADD COLUMN     "salleId" TEXT;

-- CreateTable
CREATE TABLE "salles" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capacite" INTEGER,

    CONSTRAINT "salles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "salles_ecoleId_idx" ON "salles"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "salles_ecoleId_nom_key" ON "salles"("ecoleId", "nom");

-- CreateIndex
CREATE INDEX "creneaux_salleId_jour_idx" ON "creneaux"("salleId", "jour");

-- AddForeignKey
ALTER TABLE "salles" ADD CONSTRAINT "salles_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "salles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
