-- CreateEnum
CREATE TYPE "TypeAnnulation" AS ENUM ('ADMISSION', 'REFUS');

-- CreateTable
CREATE TABLE "annulations_admission" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "type" "TypeAnnulation" NOT NULL,
    "nomEleve" TEXT NOT NULL,
    "prenomEleve" TEXT NOT NULL,
    "detail" TEXT,
    "annuleeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annulations_admission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "annulations_admission_ecoleId_createdAt_idx" ON "annulations_admission"("ecoleId", "createdAt");

-- AddForeignKey
ALTER TABLE "annulations_admission" ADD CONSTRAINT "annulations_admission_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulations_admission" ADD CONSTRAINT "annulations_admission_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes_inscription"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
