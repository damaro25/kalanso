-- CreateTable
CREATE TABLE "affectations_enseignants" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affectations_enseignants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "affectations_enseignants_ecoleId_idx" ON "affectations_enseignants"("ecoleId");

-- CreateIndex
CREATE INDEX "affectations_enseignants_classeId_idx" ON "affectations_enseignants"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "affectations_enseignants_personnelId_classeId_key" ON "affectations_enseignants"("personnelId", "classeId");

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "affectations_enseignants" ADD CONSTRAINT "affectations_enseignants_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
