-- CreateEnum
CREATE TYPE "TypePersonnel" AS ENUM ('ENSEIGNANT', 'ADMINISTRATIF');

-- AlterTable
ALTER TABLE "personnel_classes" ADD COLUMN     "heuresParMois" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "tauxHoraire" DECIMAL(12,2);

-- AlterTable
ALTER TABLE "personnels" ADD COLUMN     "type" "TypePersonnel" NOT NULL DEFAULT 'ADMINISTRATIF';
