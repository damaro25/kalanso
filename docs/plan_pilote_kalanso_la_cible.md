# Plan pilote Kalanso - Les Ecoles La Cible du Formateur

Date de preparation : 2026-07-03
Statut : ecole candidate supplementaire, distincte des 3 ecoles pilotes initiales
Dossier source : context/import/etude_des_documents_interne_ecole/

## 1. Positionnement du pilote

Les Ecoles La Cible du Formateur doivent etre traitees comme un pilote strategique de phase 2, pas comme un simple test rapide. Le dossier transmis montre un besoin reel, mais aussi une ambition fonctionnelle tres large : multi-campus, RBAC, scolarite, pedagogie, finances, paie, communication parents, reporting IRE/DCE.

Decision recommandee : demarrer par un pilote cadre sur un seul campus prioritaire, puis etendre aux autres campus apres validation.

## 2. Objectif principal

Verifier que Kalanso peut remplacer progressivement la gestion papier actuelle par une gestion numerique fiable sur les processus essentiels :

- Identification de l'etablissement et des campus
- Gestion des eleves et inscriptions
- Suivi des effectifs par classe
- Gestion du personnel enseignant et administratif
- Suivi de l'ecolage et des paiements
- Production de bulletins et documents administratifs simples
- Reporting de base pour la direction

## 3. Perimetre MVP recommande

### Inclus dans le pilote

1. Administration
- Creation du compte etablissement
- Creation du campus prioritaire
- Gestion des roles : fondateur, chef d'etablissement, secretaire, comptable, enseignant

2. Scolarite
- Import ou saisie des eleves
- Affectation des eleves aux classes
- Suivi des effectifs par niveau, filles/garcons si disponible
- Consultation simple des fiches eleves

3. Personnel
- Saisie du personnel administratif et enseignant
- Association enseignant, matiere, classe
- Base de donnees personnel exploitable pour la paie plus tard

4. Finances simples
- Parametrage des frais d'ecolage par niveau
- Enregistrement manuel des paiements
- Solde par eleve
- Liste des impayes
- Recu simple de paiement

5. Absences simples
- Appel journalier ou par classe
- Statut present, absent, retard
- Tableau de suivi par classe

6. Reporting direction
- Tableau de bord : nombre d'eleves, paiements, impayes, absences, personnel
- Export Excel ou PDF des listes principales

### Hors perimetre du premier pilote

- Paiement Mobile Money automatise
- Messagerie parent complete
- Application mobile dediee
- Signature numerique avancee
- Bulletin de salaire automatise complet
- Gestion de cantine, transport, bibliotheque
- Generation automatique avancee d'emplois du temps
- Multi-campus complet en production
- Portail eleve complet

Ces elements doivent rester dans la feuille de route, mais pas dans le pilote initial.

## 4. Donnees a collecter avant demarrage

### Identification

- Nom legal exact de l'etablissement ou du reseau
- Nombre exact de campus
- Adresse de chaque campus
- DCE/IRE de rattachement
- Contact du fondateur
- Contact du chef d'etablissement du campus pilote

### Eleves

- Liste des eleves du campus pilote
- Classe actuelle
- Sexe
- Date et lieu de naissance si disponible
- Nom du parent ou tuteur
- Telephone parent ou tuteur
- Statut de paiement si disponible

### Classes

- Liste des niveaux ouverts
- Classes par niveau
- Capacite approximative par classe
- Titulaire de classe si applicable

### Personnel

- Liste des enseignants
- Liste du personnel administratif
- Fonction
- Telephone
- Matiere enseignee
- Classe ou niveau associe
- Salaire de base si le module paie est teste plus tard

### Finances

- Tarif d'ecolage par niveau
- Frais annexes : inscription, tenue, transport, cantine, assurance
- Periodicite de paiement
- Regles de retard
- Liste des paiements deja effectues si disponible

### Technique

- Nombre d'ordinateurs disponibles
- Connexion internet disponible ou non
- Usage principal : ordinateur ou smartphone
- Presence d'un groupe electrogene ou source alternative
- Personnes capables d'utiliser Excel ou outils numeriques

## 5. Roles cote ecole

- Sponsor : fondateur ou directeur general
- Responsable operationnel : chef d'etablissement du campus pilote
- Referent scolarite : secretaire principal
- Referent finances : comptable ou econome
- Referent pedagogique : directeur pedagogique ou censeur
- Utilisateurs test : 2 enseignants, 1 secretaire, 1 comptable, 1 membre de direction

## 6. Roles cote Kalanso

- Responsable produit : Laby Damaro
- Responsable technique : Laby Damaro ou personne deleguee
- Support terrain : a designer avant installation
- Charge de formation : a designer si le pilote est confirme

## 7. Calendrier recommande

### Semaine 0 : Qualification

- Envoyer le questionnaire au fondateur et au chef d'etablissement
- Obtenir les reponses et les contacts directs
- Choisir le campus pilote
- Confirmer le perimetre du test

Livrable : fiche de qualification ecole.

### Semaine 1 : Collecte et preparation des donnees

- Recuperer les listes eleves, classes, personnel et tarifs
- Nettoyer les donnees dans un fichier Excel standard
- Creer le compte ecole dans Kalanso
- Configurer annee scolaire, classes, niveaux, utilisateurs

Livrable : base initiale prete pour import ou saisie.

### Semaine 2 : Installation et formation

- Installer ou ouvrir l'acces Kalanso
- Former direction, secretariat, comptabilite et enseignants test
- Faire une simulation complete : inscription, paiement, absence, tableau de bord

Livrable : PV de formation et liste utilisateurs actifs.

### Semaines 3 a 5 : Test terrain

- Utilisation quotidienne par l'ecole
- Suivi des incidents via WhatsApp Business ou tableau simple
- Correction rapide des blocages critiques
- Reunion courte chaque semaine avec le responsable operationnel

Livrable : journal de pilote.

### Semaine 6 : Bilan

- Evaluer adoption, satisfaction et problemes
- Identifier les modules a renforcer
- Decider : extension au reseau, poursuite commerciale, ou second cycle de correction

Livrable : rapport de bilan pilote et proposition commerciale.

## 8. Criteres de succes

Le pilote est reussi si :

- Au moins 80 % des eleves du campus pilote sont enregistres dans Kalanso
- Au moins 80 % des paiements du mois sont saisis dans Kalanso
- La direction consulte le tableau de bord au moins 2 fois par semaine
- Le secretariat utilise Kalanso pour les fiches eleves et listes de classes
- Au moins 2 enseignants utilisent le module absences ou notes pendant le test
- Le temps de production d'une liste ou situation passe de manuel a moins de 10 minutes
- Satisfaction direction superieure ou egale a 80 %
- Aucune perte de donnees critique

## 9. Risques et parades

### Risque : perimetre trop ambitieux
Parade : imposer un pilote sur un seul campus et un nombre limite de modules.

### Risque : donnees papier incompletes
Parade : commencer avec les donnees minimales utiles, puis enrichir progressivement.

### Risque : faible maturite numerique du personnel
Parade : formation courte, procedures visuelles, support WhatsApp.

### Risque : internet instable
Parade : privilegier les operations simples, interfaces legeres, exports Excel/PDF, et prevoir une strategie offline plus tard.

### Risque : confusion entre projet sur mesure et produit SaaS
Parade : expliquer que Kalanso est un produit standard configurable, pas un developpement totalement specifique pour une seule ecole.

## 10. Prochaine action immediate

Envoyer le questionnaire au fondateur et au chef d'etablissement, puis organiser un rendez-vous de qualification de 45 minutes.

Objectif du rendez-vous :
- Choisir le campus pilote
- Valider le perimetre MVP
- Identifier les utilisateurs cles
- Obtenir les donnees minimales
- Fixer une date de demonstration

## 11. Decision recommandee

Ne pas integrer Les Ecoles La Cible du Formateur dans le sprint pilote initial si cela menace le delai du 31 aout 2026. Les traiter comme une opportunite commerciale prioritaire pour octobre-decembre 2026, avec une qualification technique et metier des maintenant.
