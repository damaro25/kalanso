-- Budget de trésorerie : postes de dépenses prévus par année scolaire
CREATE TABLE "budget_depenses" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "montants" DECIMAL(14,2)[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "budget_depenses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "budget_depenses_ecoleId_anneeScolaireId_idx" ON "budget_depenses"("ecoleId", "anneeScolaireId");
ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "budget_depenses" ADD CONSTRAINT "budget_depenses_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
