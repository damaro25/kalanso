-- CreateEnum
CREATE TYPE "OperateurMobileMoney" AS ENUM ('ORANGE_MONEY', 'MTN_MOMO');

-- CreateEnum
CREATE TYPE "StatutTransaction" AS ENUM ('EN_ATTENTE', 'REUSSIE', 'ECHOUEE', 'ANNULEE');

-- AlterEnum
ALTER TYPE "ModePaiement" ADD VALUE 'MOBILE_MONEY';

-- CreateTable
CREATE TABLE "transactions_mobile_money" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "paiementId" TEXT,
    "operateur" "OperateurMobileMoney" NOT NULL,
    "telephone" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "statut" "StatutTransaction" NOT NULL DEFAULT 'EN_ATTENTE',
    "reference" TEXT NOT NULL,
    "initieeParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_mobile_money_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "transactions_mobile_money_paiementId_key" ON "transactions_mobile_money"("paiementId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_mobile_money_reference_key" ON "transactions_mobile_money"("reference");

-- CreateIndex
CREATE INDEX "transactions_mobile_money_ecoleId_createdAt_idx" ON "transactions_mobile_money"("ecoleId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_mobile_money_factureId_idx" ON "transactions_mobile_money"("factureId");

-- AddForeignKey
ALTER TABLE "transactions_mobile_money" ADD CONSTRAINT "transactions_mobile_money_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_mobile_money" ADD CONSTRAINT "transactions_mobile_money_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions_mobile_money" ADD CONSTRAINT "transactions_mobile_money_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
