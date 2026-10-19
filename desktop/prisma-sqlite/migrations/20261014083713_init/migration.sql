-- CreateTable
CREATE TABLE "ecoles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nom" TEXT NOT NULL,
    "sigle" TEXT,
    "ville" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "logoUrl" TEXT,
    "nomDirecteur" TEXT,
    "nomComptable" TEXT,
    "numeroRecuDepart" INTEGER,
    "carteRetraitMinistere" TEXT,
    "carteRetraitDev" TEXT,
    "carteRetraitDce" TEXT,
    "carteRetraitSignataire" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "utilisateurs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "motDePasseHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "personnelId" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "dernierLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "utilisateurs_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "utilisateurs_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "annees_scolaires" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL,
    "dateFin" DATETIME NOT NULL,
    "courante" BOOLEAN NOT NULL DEFAULT false,
    "cloturee" BOOLEAN NOT NULL DEFAULT false,
    "clotureLe" DATETIME,
    "clotureParId" TEXT,
    "clotureResume" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "annees_scolaires_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "niveaux" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "cycle" TEXT,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "niveaux_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "frais_inscription_niveau" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "montant" DECIMAL NOT NULL,
    "montantReinscription" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "frais_inscription_niveau_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "frais_inscription_niveau_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "classes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capaciteMax" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "classes_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "classes_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "classes_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "personnels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "genre" TEXT,
    "telephone" TEXT,
    "email" TEXT,
    "fonction" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ADMINISTRATIF',
    "dateEmbauche" DATETIME,
    "salaireBase" DECIMAL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "personnels_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "eleves" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "matricule" TEXT,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "dateNaissance" DATETIME,
    "lieuNaissance" TEXT,
    "adresse" TEXT,
    "photoUrl" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "eleves_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "parents_tuteurs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "telephone" TEXT,
    "email" TEXT,
    "profession" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parents_tuteurs_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "eleves_parents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "eleveId" TEXT NOT NULL,
    "parentTuteurId" TEXT NOT NULL,
    "lien" TEXT NOT NULL,
    "contactPrincipal" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "eleves_parents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "eleves_parents_parentTuteurId_fkey" FOREIGN KEY ("parentTuteurId") REFERENCES "parents_tuteurs" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inscriptions" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "dateInscription" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "statut" TEXT NOT NULL DEFAULT 'EN_COURS',
    "regime" TEXT NOT NULL DEFAULT 'EXTERNAT',
    CONSTRAINT "inscriptions_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "statut" TEXT NOT NULL,
    "motif" TEXT,
    "saisieParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "absences_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "absences_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "absences_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "absences_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tarifs_ecolage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL NOT NULL,
    "regime" TEXT,
    "dateEcheance" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tarifs_ecolage_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "tarifs_ecolage_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "factures" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'ECOLAGE',
    "montantTotal" DECIMAL NOT NULL,
    "montantPaye" DECIMAL NOT NULL DEFAULT 0,
    "statut" TEXT NOT NULL DEFAULT 'IMPAYEE',
    "dateEcheance" DATETIME,
    "formationId" TEXT,
    "moisFormation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "factures_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "factures_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "factures_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "factures_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations_supplementaires" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "numero" INTEGER,
    "montant" DECIMAL NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'ESPECES',
    "reference" TEXT,
    "datePaiement" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "saisieParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "paiements_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "paiements_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "transactions_mobile_money" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "factureId" TEXT NOT NULL,
    "paiementId" TEXT,
    "operateur" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "montant" DECIMAL NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "reference" TEXT NOT NULL,
    "initieeParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "transactions_mobile_money_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_mobile_money_factureId_fkey" FOREIGN KEY ("factureId") REFERENCES "factures" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transactions_mobile_money_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiements" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "matieres" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "niveauId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "coefficient" DECIMAL NOT NULL,
    CONSTRAINT "matieres_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "matieres_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "notes" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "trimestre" INTEGER NOT NULL,
    "valeur" DECIMAL NOT NULL,
    "appreciation" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "notes_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notes_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notes_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "notes_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "salles" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "capacite" INTEGER,
    CONSTRAINT "salles_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "creneaux" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "matiereId" TEXT NOT NULL,
    "personnelId" TEXT,
    "salleId" TEXT,
    "anneeScolaireId" TEXT NOT NULL,
    "jour" TEXT NOT NULL,
    "heureDebut" TEXT NOT NULL,
    "heureFin" TEXT NOT NULL,
    "tauxHoraire" DECIMAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "creneaux_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "creneaux_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "creneaux_matiereId_fkey" FOREIGN KEY ("matiereId") REFERENCES "matieres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "creneaux_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "creneaux_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "salles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "affectations_enseignants" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "classeId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "affectations_enseignants_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "affectations_enseignants_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "affectations_enseignants_classeId_fkey" FOREIGN KEY ("classeId") REFERENCES "classes" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "messages_parents" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT,
    "parentTuteurId" TEXT,
    "telephone" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'MANUEL',
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "envoyeParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "messages_parents_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "messages_parents_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "messages_parents_parentTuteurId_fkey" FOREIGN KEY ("parentTuteurId") REFERENCES "parents_tuteurs" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "demandes_inscription" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nomEleve" TEXT NOT NULL,
    "prenomEleve" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "dateNaissance" DATETIME,
    "lieuNaissance" TEXT,
    "niveauId" TEXT,
    "niveauSouhaite" TEXT,
    "nomParent" TEXT NOT NULL,
    "prenomParent" TEXT NOT NULL,
    "telephoneParent" TEXT NOT NULL,
    "emailParent" TEXT,
    "perePrenom" TEXT,
    "pereNom" TEXT,
    "pereTelephone" TEXT,
    "pereProfession" TEXT,
    "merePrenom" TEXT,
    "mereNom" TEXT,
    "mereTelephone" TEXT,
    "mereProfession" TEXT,
    "piecesJointes" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus" TEXT,
    "eleveId" TEXT,
    "traiteeParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "demandes_inscription_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "demandes_inscription_niveauId_fkey" FOREIGN KEY ("niveauId") REFERENCES "niveaux" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "demandes_inscription_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "annulations_admission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "demandeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nomEleve" TEXT NOT NULL,
    "prenomEleve" TEXT NOT NULL,
    "detail" TEXT,
    "annuleeParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "annulations_admission_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "annulations_admission_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes_inscription" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "documents_demande" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "demandeId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "cheminFichier" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tailleOctets" INTEGER NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "commentaire" TEXT,
    "verifieParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documents_demande_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demandes_inscription" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "bulletins_paie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "personnelId" TEXT NOT NULL,
    "mois" INTEGER NOT NULL,
    "annee" INTEGER NOT NULL,
    "nombreHeures" INTEGER,
    "totalGains" DECIMAL NOT NULL,
    "totalRetenues" DECIMAL NOT NULL,
    "netAPayer" DECIMAL NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'BROUILLON',
    "modePaiement" TEXT,
    "creeParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "bulletins_paie_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bulletins_paie_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "personnels" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "lignes_bulletin_paie" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "bulletinPaieId" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "imposable" BOOLEAN NOT NULL DEFAULT false,
    "montantGain" DECIMAL NOT NULL DEFAULT 0,
    "montantRetenue" DECIMAL NOT NULL DEFAULT 0,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "lignes_bulletin_paie_bulletinPaieId_fkey" FOREIGN KEY ("bulletinPaieId") REFERENCES "bulletins_paie" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "materiels" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "etat" TEXT NOT NULL DEFAULT 'BON',
    "salleId" TEXT,
    "description" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "materiels_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "materiels_salleId_fkey" FOREIGN KEY ("salleId") REFERENCES "salles" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "mouvements_financiers" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "montant" DECIMAL NOT NULL,
    "date" DATETIME NOT NULL,
    "modePaiement" TEXT,
    "saisieParId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "mouvements_financiers_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "livres" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "titre" TEXT NOT NULL,
    "auteur" TEXT,
    "isbn" TEXT,
    "categorie" TEXT,
    "quantiteTotale" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "livres_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "emprunts" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "livreId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "dateEmprunt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateRetourPrevue" DATETIME NOT NULL,
    "dateRetourEffective" DATETIME,
    "statut" TEXT NOT NULL DEFAULT 'EN_COURS',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "emprunts_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "emprunts_livreId_fkey" FOREIGN KEY ("livreId") REFERENCES "livres" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "emprunts_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "budget_depenses" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "poste" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "montants" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "budget_depenses_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "budget_depenses_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "formations_supplementaires" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "tarifMensuel" INTEGER NOT NULL DEFAULT 0,
    "regimesGratuits" JSONB NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "formations_supplementaires_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "inscriptions_formations" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "eleveId" TEXT NOT NULL,
    "formationId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "dateDebut" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "inscriptions_formations_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_formations_eleveId_fkey" FOREIGN KEY ("eleveId") REFERENCES "eleves" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_formations_formationId_fkey" FOREIGN KEY ("formationId") REFERENCES "formations_supplementaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "inscriptions_formations_anneeScolaireId_fkey" FOREIGN KEY ("anneeScolaireId") REFERENCES "annees_scolaires" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "tarifs_assurance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ecoleId" TEXT NOT NULL,
    "anneeScolaireId" TEXT NOT NULL,
    "cycle" TEXT NOT NULL DEFAULT '',
    "montant" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "tarifs_assurance_ecoleId_fkey" FOREIGN KEY ("ecoleId") REFERENCES "ecoles" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE INDEX "frais_inscription_niveau_ecoleId_idx" ON "frais_inscription_niveau"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "frais_inscription_niveau_ecoleId_niveauId_anneeScolaireId_key" ON "frais_inscription_niveau"("ecoleId", "niveauId", "anneeScolaireId");

-- CreateIndex
CREATE INDEX "classes_ecoleId_idx" ON "classes"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "classes_ecoleId_anneeScolaireId_nom_key" ON "classes"("ecoleId", "anneeScolaireId", "nom");

-- CreateIndex
CREATE INDEX "personnels_ecoleId_idx" ON "personnels"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "personnels_ecoleId_matricule_key" ON "personnels"("ecoleId", "matricule");

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
CREATE UNIQUE INDEX "factures_eleveId_formationId_moisFormation_key" ON "factures"("eleveId", "formationId", "moisFormation");

-- CreateIndex
CREATE INDEX "paiements_ecoleId_idx" ON "paiements"("ecoleId");

-- CreateIndex
CREATE INDEX "paiements_factureId_idx" ON "paiements"("factureId");

-- CreateIndex
CREATE UNIQUE INDEX "paiements_ecoleId_numero_key" ON "paiements"("ecoleId", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_mobile_money_paiementId_key" ON "transactions_mobile_money"("paiementId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_mobile_money_reference_key" ON "transactions_mobile_money"("reference");

-- CreateIndex
CREATE INDEX "transactions_mobile_money_ecoleId_createdAt_idx" ON "transactions_mobile_money"("ecoleId", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_mobile_money_factureId_idx" ON "transactions_mobile_money"("factureId");

-- CreateIndex
CREATE INDEX "matieres_ecoleId_idx" ON "matieres"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "matieres_ecoleId_niveauId_nom_key" ON "matieres"("ecoleId", "niveauId", "nom");

-- CreateIndex
CREATE INDEX "notes_classeId_trimestre_idx" ON "notes"("classeId", "trimestre");

-- CreateIndex
CREATE INDEX "notes_ecoleId_idx" ON "notes"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "notes_eleveId_matiereId_anneeScolaireId_trimestre_key" ON "notes"("eleveId", "matiereId", "anneeScolaireId", "trimestre");

-- CreateIndex
CREATE INDEX "salles_ecoleId_idx" ON "salles"("ecoleId");

-- CreateIndex
CREATE UNIQUE INDEX "salles_ecoleId_nom_key" ON "salles"("ecoleId", "nom");

-- CreateIndex
CREATE INDEX "creneaux_classeId_jour_idx" ON "creneaux"("classeId", "jour");

-- CreateIndex
CREATE INDEX "creneaux_personnelId_jour_idx" ON "creneaux"("personnelId", "jour");

-- CreateIndex
CREATE INDEX "creneaux_salleId_jour_idx" ON "creneaux"("salleId", "jour");

-- CreateIndex
CREATE INDEX "creneaux_ecoleId_idx" ON "creneaux"("ecoleId");

-- CreateIndex
CREATE INDEX "affectations_enseignants_ecoleId_idx" ON "affectations_enseignants"("ecoleId");

-- CreateIndex
CREATE INDEX "affectations_enseignants_classeId_idx" ON "affectations_enseignants"("classeId");

-- CreateIndex
CREATE UNIQUE INDEX "affectations_enseignants_personnelId_classeId_key" ON "affectations_enseignants"("personnelId", "classeId");

-- CreateIndex
CREATE INDEX "messages_parents_ecoleId_createdAt_idx" ON "messages_parents"("ecoleId", "createdAt");

-- CreateIndex
CREATE INDEX "messages_parents_eleveId_idx" ON "messages_parents"("eleveId");

-- CreateIndex
CREATE INDEX "demandes_inscription_ecoleId_statut_idx" ON "demandes_inscription"("ecoleId", "statut");

-- CreateIndex
CREATE INDEX "annulations_admission_ecoleId_createdAt_idx" ON "annulations_admission"("ecoleId", "createdAt");

-- CreateIndex
CREATE INDEX "documents_demande_demandeId_idx" ON "documents_demande"("demandeId");

-- CreateIndex
CREATE INDEX "bulletins_paie_ecoleId_annee_mois_idx" ON "bulletins_paie"("ecoleId", "annee", "mois");

-- CreateIndex
CREATE UNIQUE INDEX "bulletins_paie_personnelId_mois_annee_key" ON "bulletins_paie"("personnelId", "mois", "annee");

-- CreateIndex
CREATE INDEX "lignes_bulletin_paie_bulletinPaieId_idx" ON "lignes_bulletin_paie"("bulletinPaieId");

-- CreateIndex
CREATE INDEX "materiels_ecoleId_categorie_idx" ON "materiels"("ecoleId", "categorie");

-- CreateIndex
CREATE INDEX "materiels_salleId_idx" ON "materiels"("salleId");

-- CreateIndex
CREATE INDEX "mouvements_financiers_ecoleId_date_idx" ON "mouvements_financiers"("ecoleId", "date");

-- CreateIndex
CREATE INDEX "mouvements_financiers_ecoleId_type_idx" ON "mouvements_financiers"("ecoleId", "type");

-- CreateIndex
CREATE INDEX "livres_ecoleId_idx" ON "livres"("ecoleId");

-- CreateIndex
CREATE INDEX "emprunts_ecoleId_statut_idx" ON "emprunts"("ecoleId", "statut");

-- CreateIndex
CREATE INDEX "emprunts_livreId_idx" ON "emprunts"("livreId");

-- CreateIndex
CREATE INDEX "emprunts_eleveId_idx" ON "emprunts"("eleveId");

-- CreateIndex
CREATE INDEX "budget_depenses_ecoleId_anneeScolaireId_idx" ON "budget_depenses"("ecoleId", "anneeScolaireId");

-- CreateIndex
CREATE UNIQUE INDEX "formations_supplementaires_ecoleId_nom_key" ON "formations_supplementaires"("ecoleId", "nom");

-- CreateIndex
CREATE INDEX "inscriptions_formations_ecoleId_anneeScolaireId_idx" ON "inscriptions_formations"("ecoleId", "anneeScolaireId");

-- CreateIndex
CREATE UNIQUE INDEX "inscriptions_formations_eleveId_formationId_anneeScolaireId_key" ON "inscriptions_formations"("eleveId", "formationId", "anneeScolaireId");

-- CreateIndex
CREATE UNIQUE INDEX "tarifs_assurance_ecoleId_anneeScolaireId_cycle_key" ON "tarifs_assurance"("ecoleId", "anneeScolaireId", "cycle");
