-- CreateEnum
CREATE TYPE "JourSemaine" AS ENUM ('LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI');

-- CreateTable
CREATE TABLE "creneaux" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "personnelId" TEXT,
    "anneeScolaireId" TEXT NOT NULL,
    "jour" "JourSemaine" NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creneaux_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creneaux_classeId_jour_idx" ON "creneaux"("classeId", "jour");

-- CreateIndex
CREATE INDEX "creneaux_personnelId_jour_idx" ON "creneaux"("personnelId", "jour");

-- CreateIndex
CREATE INDEX "creneaux_ecoleId_idx" ON "creneaux"("ecoleId");

-- AddForeignKey
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creneaux" ADD CONSTRAINT "creneaux_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
