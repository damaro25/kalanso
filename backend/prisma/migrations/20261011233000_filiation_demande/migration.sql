-- Filiation (père, mère) saisie à l'inscription sur place, reportée sur l'élève à l'acceptation

-- AlterTable
ALTER TABLE "demandes_inscription" ADD COLUMN     "mereNom" TEXT,
ADD COLUMN     "merePrenom" TEXT,
ADD COLUMN     "mereProfession" TEXT,
ADD COLUMN     "mereTelephone" TEXT,
ADD COLUMN     "pereNom" TEXT,
ADD COLUMN     "perePrenom" TEXT,
ADD COLUMN     "pereProfession" TEXT,
ADD COLUMN     "pereTelephone" TEXT;

