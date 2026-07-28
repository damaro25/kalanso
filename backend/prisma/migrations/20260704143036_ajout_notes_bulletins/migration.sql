-- CreateTable
CREATE TABLE "matieres" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "coefficient" DECIMAL(4,2) NOT NULL,

    CONSTRAINT "matieres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "valeur" DECIMAL(4,2) NOT NULL,
    "appreciation" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "matieres_ecoleId_idx" ON "matieres"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "matieres_ecoleId_niveauId_nom_key" ON "matieres"("ecoleId", "niveauId", "nom");

-- CreateIndex
CREATE INDEX "notes_classeId_trimestre_idx" ON "notes"("classeId", "trimestre");

-- CreateIndex
CREATE INDEX "notes_ecoleId_idx" ON "notes"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "notes_eleveId_matiereId_anneeScolaireId_trimestre_key" ON "notes"("eleveId", "matiereId", "anneeScolaireId", "trimestre");

-- AddForeignKey
ALTER TABLE "matieres" ADD CONSTRAINT "matieres_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "matieres" ADD CONSTRAINT "matieres_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
