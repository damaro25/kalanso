-- Cartes de retrait (maternelle) : en-tête (ministère, DEV, DCE) et signataire, configurables par école

-- AlterTable
ALTER TABLE "ecoles" ADD COLUMN     "carteRetraitDce" TEXT,
ADD COLUMN     "carteRetraitDev" TEXT,
ADD COLUMN     "carteRetraitMinistere" TEXT,
ADD COLUMN     "carteRetraitSignataire" TEXT;

