-- Annulation d'un paiement par le fondateur : trace du paiement retiré (copie, motif, qui et quand)

-- CreateTable
CREATE TABLE "paiements_annules" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "factureLibelle" TEXT NOT NULL,
    "paiementId" TEXT NOT NULL,
    "numero" INTEGER,
    "montant" DECIMAL(12,2) NOT NULL,
    "mode" "ModePaiement" NOT NULL,
    "reference" TEXT,
    "datePaiement" TIMESTAMP(3) NOT NULL,
    "saisieParId" TEXT,
    "motif" TEXT NOT NULL,
    "annuleParId" TEXT,
    "annuleLe" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_annules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "paiements_annules_ecoleId_annuleLe_idx" ON "paiements_annules"("ecoleId", "annuleLe");

-- CreateIndex
CREATE INDEX "paiements_annules_eleveId_idx" ON "paiements_annules"("eleveId");
