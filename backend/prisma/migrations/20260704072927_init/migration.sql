-- CreateEnum
CREATE TYPE "RoleUtilisateur" AS ENUM ('FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE', 'COMPTABLE', 'ENSEIGNANT');

-- CreateEnum
CREATE TYPE "Genre" AS ENUM ('M', 'F');

-- CreateEnum
CREATE TYPE "StatutInscription" AS ENUM ('EN_COURS', 'TERMINEE', 'ABANDONNEE', 'TRANSFEREE');

-- CreateEnum
CREATE TYPE "StatutAbsence" AS ENUM ('PRESENT', 'ABSENT', 'RETARD');

-- CreateEnum
CREATE TYPE "StatutFacture" AS ENUM ('IMPAYEE', 'PARTIELLE', 'PAYEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "ModePaiement" AS ENUM ('ESPECES', 'VIREMENT', 'CHEQUE', 'AUTRE');

-- CreateTable
CREATE TABLE "ecoles" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "sigle" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ecoles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" "RoleUtilisateur" NOT NULL,
    "personnelId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dernierLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "utilisateurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "annees_scolaires" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" TIMESTAMP(3) NOT NULL,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "courante" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "annees_scolaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "niveaux" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cycle" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "niveaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capaciteMax" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnels" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "genre" "Genre",
    "telephone" TEXT,
    "email" TEXT,
    "fonction" TEXT NOT NULL,
    "dateEmbauche" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "personnels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personnel_classes" (
    "id" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiere" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personnel_classes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eleves" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "genre" "Genre" NOT NULL,
    "dateNaissance" TIMESTAMP(3),
    "lieuNaissance" TEXT,
    "adresse" TEXT,
    "photoUrl" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "eleves_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parents_tuteurs" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "profession" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "parents_tuteurs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "eleves_parents" (
    "id" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "parentTuteurId" TEXT NOT NULL,
    "lien" TEXT NOT NULL,
    "contactPrincipal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "eleves_parents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inscriptions" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "dateInscription" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" "StatutInscription" NOT NULL DEFAULT 'EN_COURS',

    CONSTRAINT "inscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "statut" "StatutAbsence" NOT NULL,
    "motif" TEXT,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifs_ecolage" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifs_ecolage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montantTotal" DECIMAL(12,2) NOT NULL,
    "montantPaye" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statut" "StatutFacture" NOT NULL DEFAULT 'IMPAYEE',
    "dateEcheance" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL,
    "ecoleId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "mode" "ModePaiement" NOT NULL DEFAULT 'ESPECES',
    "reference" TEXT,
    "datePaiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saisieParId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_email_key" ON "utilisateurs"("email");

-- CreateIndex
CREATE UNIQUE INDEX "utilisateurs_personnelId_key" ON "utilisateurs"("personnelId");

-- CreateIndex
CREATE INDEX "utilisateurs_ecoleId_idx" ON "utilisateurs"("ecoleId");

-- CreateIndex
CREATE INDEX "annees_scolaires_ecoleId_idx" ON "annees_scolaires"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "annees_scolaires_ecoleId_libelle_key" ON "annees_scolaires"("ecoleId", "libelle");

-- CreateIndex
CREATE INDEX "niveaux_ecoleId_idx" ON "niveaux"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "niveaux_ecoleId_nom_key" ON "niveaux"("ecoleId", "nom");

-- CreateIndex
CREATE INDEX "classes_ecoleId_idx" ON "classes"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_ecoleId_anneeScolaireId_nom_key" ON "classes"("ecoleId", "anneeScolaireId", "nom");

-- CreateIndex
CREATE INDEX "personnels_ecoleId_idx" ON "personnels"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "personnels_ecoleId_matricule_key" ON "personnels"("ecoleId", "matricule");

-- CreateIndex
CREATE INDEX "personnel_classes_classeId_idx" ON "personnel_classes"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "personnel_classes_personnelId_classeId_matiere_key" ON "personnel_classes"("personnelId", "classeId", "matiere");

-- CreateIndex
CREATE INDEX "eleves_ecoleId_idx" ON "eleves"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "eleves_ecoleId_matricule_key" ON "eleves"("ecoleId", "matricule");

-- CreateIndex
CREATE INDEX "parents_tuteurs_ecoleId_idx" ON "parents_tuteurs"("ecoleId");

-- CreateIndex
CREATE INDEX "eleves_parents_eleveId_idx" ON "eleves_parents"("eleveId");

-- CreateIndex
CREATE UNIQUE INDEX "eleves_parents_eleveId_parentTuteurId_key" ON "eleves_parents"("eleveId", "parentTuteurId");

-- CreateIndex
CREATE INDEX "inscriptions_ecoleId_idx" ON "inscriptions"("ecoleId");

-- CreateIndex
CREATE INDEX "inscriptions_classeId_idx" ON "inscriptions"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "inscriptions_eleveId_anneeScolaireId_key" ON "inscriptions"("eleveId", "anneeScolaireId");

-- CreateIndex
CREATE INDEX "absences_classeId_date_idx" ON "absences"("classeId", "date");

-- CreateIndex
CREATE INDEX "absences_ecoleId_idx" ON "absences"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "absences_eleveId_date_key" ON "absences"("eleveId", "date");

-- CreateIndex
CREATE INDEX "tarifs_ecolage_ecoleId_idx" ON "tarifs_ecolage"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "tarifs_ecolage_ecoleId_niveauId_anneeScolaireId_libelle_key" ON "tarifs_ecolage"("ecoleId", "niveauId", "anneeScolaireId", "libelle");

-- CreateIndex
CREATE INDEX "factures_ecoleId_idx" ON "factures"("ecoleId");

-- CreateIndex
CREATE INDEX "factures_eleveId_idx" ON "factures"("eleveId");

-- CreateIndex
CREATE INDEX "factures_statut_idx" ON "factures"("statut");

-- CreateIndex
CREATE INDEX "paiements_ecoleId_idx" ON "paiements"("ecoleId");

-- CreateIndex
CREATE INDEX "paiements_factureId_idx" ON "paiements"("factureId");

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "utilisateurs" ADD CONSTRAINT "utilisateurs_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annees_scolaires" ADD CONSTRAINT "annees_scolaires_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "niveaux" ADD CONSTRAINT "niveaux_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "classes" ADD CONSTRAINT "classes_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnels" ADD CONSTRAINT "personnels_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_classes" ADD CONSTRAINT "personnel_classes_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personnel_classes" ADD CONSTRAINT "personnel_classes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves" ADD CONSTRAINT "eleves_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "parents_tuteurs" ADD CONSTRAINT "parents_tuteurs_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves_parents" ADD CONSTRAINT "eleves_parents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "eleves_parents" ADD CONSTRAINT "eleves_parents_parentTuteurId_fkey" FOREIGN KEY ("parentTuteurId") REFERENCES "parents_tuteurs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inscriptions" ADD CONSTRAINT "inscriptions_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifs_ecolage" ADD CONSTRAINT "tarifs_ecolage_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarifs_ecolage" ADD CONSTRAINT "tarifs_ecolage_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "factures" ADD CONSTRAINT "factures_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paiements" ADD CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
