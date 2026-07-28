
-- DropForeignKey
ALTER TABLE "personnel_classes" DROP CONSTRAINT "personnel_classes_classeId_fkey";

-- DropForeignKey
ALTER TABLE "personnel_classes" DROP CONSTRAINT "personnel_classes_personnelId_fkey";

-- AlterTable
ALTER TABLE "creneaux" ADD COLUMN     "tauxHoraire" DECIMAL(12,2);

-- DropTable
DROP TABLE "personnel_classes";

