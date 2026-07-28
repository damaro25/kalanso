-- CreateEnum
CREATE TYPE "TypeFacture" AS ENUM ('ECOLAGE', 'INSCRIPTION', 'AUTRE');

-- AlterTable
ALTER TABLE "classes" ADD COLUMN     "fraisInscription" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "factures" ADD COLUMN     "type" "TypeFacture" NOT NULL DEFAULT 'ECOLAGE';
