-- CreateEnum
CREATE TYPE "TypeMessage" AS ENUM ('MANUEL', 'ABSENCE', 'RAPPEL_IMPAYE');

-- CreateEnum
CREATE TYPE "StatutMessage" AS ENUM ('EN_ATTENTE', 'ENVOYE', 'ECHEC');

-- CreateTable
CREATE TABLE "messages_parents" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT,
    "parentTuteurId" TEXT,
    "telephone" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "type" "TypeMessage" NOT NULL DEFAULT 'MANUEL',
    "statut" "StatutMessage" NOT NULL DEFAULT 'EN_ATTENTE',
    "envoyeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_parents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "messages_parents_ecoleId_createdAt_idx" ON "messages_parents"("ecoleId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_parents_eleveId_idx" ON "messages_parents"("eleveId");

-- AddForeignKey
ALTER TABLE "messages_parents" ADD CONSTRAINT "messages_parents_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages_parents" ADD CONSTRAINT "messages_parents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages_parents" ADD CONSTRAINT "messages_parents_parentTuteurId_fkey" FOREIGN KEY ("parentTuteurId") REFERENCES "parents_tuteurs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
