-- CreateTable
CREATE TABLE "paiements_annules" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "factureLibelle" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "numero" INTEGER,
    "montant" DECIMAL NOT NULL,
    "mode" TEXT NOT NULL,
    "reference" TEXT,
    "datePaiement" DATETIME NOT NULL,
    "saisieParId" TEXT,
    "motif" TEXT NOT NULL,
    "annuleParId" TEXT,
    "annuleLe" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "paiements_annules_ecoleId_annuleLe_idx" ON "paiements_annules"("ecoleId", "annuleLe");

-- CreateIndex
CREATE INDEX "paiements_annules_eleveId_idx" ON "paiements_annules"("eleveId");
