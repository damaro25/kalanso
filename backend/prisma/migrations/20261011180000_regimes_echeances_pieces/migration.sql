-- CreateEnum
CREATE TYPE "Regime" AS ENUM ('EXTERNAT', 'SEMI_INTERNAT', 'INTERNAT', 'PENSIONNAT');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TypeDocument" ADD VALUE 'CARNET_VACCINATION';
ALTER TYPE "TypeDocument" ADD VALUE 'LIVRET_SCOLAIRE';

-- AlterTable
ALTER TABLE "inscriptions" ADD COLUMN     "regime" "Regime" NOT NULL DEFAULT 'EXTERNAT';

-- AlterTable
ALTER TABLE "tarifs_ecolage" ADD COLUMN     "dateEcheance" TIMESTAMP(3),
ADD COLUMN     "regime" "Regime";

