-- Clôture d'année scolaire (Finances > Clôture d'année)

-- AlterTable
ALTER TABLE "annees_scolaires" ADD COLUMN     "clotureLe" TIMESTAMP(3),
ADD COLUMN     "clotureParId" TEXT,
ADD COLUMN     "clotureResume" JSONB,
ADD COLUMN     "cloturee" BOOLEAN NOT NULL DEFAULT false;

