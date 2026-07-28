**LES ÉCOLES LA CIBLE DU FORMATEUR**

*École des Élites --- Travail • Rigueur • Succès*

**DOSSIER DE CONCEPTION D\'ARCHITECTURE LOGICIELLE**

*Système d\'Information de Gestion Scolaire (SIGS)*

  ---------------------------- ------------------------------------------
  **Version**                  1.0 --- Édition Initiale

  **Date**                     Juin 2026

  **Établissement**            Les Écoles La Cible du Formateur

  **IRE**                      Conakry --- DCE: Gbessia / Matoto

  **Auteur**                   Architecte Logiciel Principal

  **Classification**           CONFIDENTIEL --- Usage Interne
  ---------------------------- ------------------------------------------

**SECTION 1 --- CARTOGRAPHIE DES ACTEURS ET GESTION DES DROITS (RBAC)**

Le système adopte un modèle RBAC (Role-Based Access Control) à
granularité fine. Chaque rôle dispose de permissions précises sur les
ressources du système. L\'accès aux données est également contrôlé par
le principe du multi-tenant : chaque établissement (tenant) est isolé et
ne peut accéder qu\'à ses propres données.

**1.1 Matrice des Rôles et Permissions Globales**

  ------------------------------------------------------------------------
  **Rôle**          **Périmètre       **Niveau           **Restrictions
                    d\'Action**       d\'Accès**         Clés**
  ----------------- ----------------- ------------------ -----------------
  Super Admin       Tous les          Full Access        Accès
  (Réseau)          établissements                       cross-tenant,
                                                         logs complets

  Directeur Général Son établissement Admin Total        Ne peut pas
                                                         modifier les logs

  Directeur         Pédagogie         Lecture/Écriture   Pas d\'accès
  Pédagogique       uniquement                           finances

  Secrétaire        Scolarité &       Lecture/Écriture   Pas d\'accès
  Principal         admissions                           salaires

  Comptable         Module financier  Lecture/Écriture   Pas d\'accès
                                                         dossiers élèves

  Enseignant        Ses classes       Écriture limitée   Notes & absences
                    uniquement                           seulement

  Élève             Son dossier       Lecture seule      Pas d\'accès aux
                    uniquement                           autres élèves

  Parent / Tuteur   Dossier de ses    Lecture +          Paiement en ligne
                    enfants           Messagerie         uniquement

  Superviseur       Rapports          Lecture seule      Pas d\'accès
  Externe           consolidés                           données brutes
  ------------------------------------------------------------------------

**1.2 Profil : Administrateur / Direction**

- Accès au tableau de bord exécutif : KPIs en temps réel (taux de
  remplissage, impayés, absences globales)

- Gestion de la configuration système : paramétrage des années
  scolaires, niveaux, filières, grilles tarifaires

- Génération de rapports financiers consolidés : masse salariale,
  recettes mensuelles, solde de trésorerie

- Audit complet : consultation des journaux d\'actions (qui a fait quoi,
  quand, depuis quelle IP)

- Gestion des comptes utilisateurs : création, suspension,
  réinitialisation de mots de passe

- Supervision pédagogique : classements généraux, taux de réussite par
  niveau et par enseignant

- Export de données : rapports XLSX/PDF pour soumission aux autorités
  éducatives (IRE, DCE, MEN)

**1.3 Profil : Secrétariat / Scolarité**

- Gestion du cycle d\'inscription : création de dossier, collecte des
  pièces, validation administrative

- Affectation des élèves dans les classes et sous-groupes

- Gestion des réinscriptions annuelles avec reprise automatique du
  dossier existant

- Édition et impression des certificats de scolarité, attestations,
  badges élèves

- Gestion des rendez-vous et agenda de la direction

- Réception et transfert des courriers entrants

**1.4 Profil : Enseignant**

- Saisie et modification des notes dans les délais autorisés (fenêtre de
  saisie contrôlée)

- Tenue du cahier de texte numérique : cours dispensés, devoirs
  assignés, objectifs pédagogiques

- Gestion des présences : pointage élève par élève avec motif d\'absence

- Partage de ressources pédagogiques (cours PDF, vidéos, exercices) vers
  les élèves de ses classes

- Consultation de son planning horaire hebdomadaire

- Messagerie avec les parents des élèves de ses classes

**1.5 Profil : Élève**

- Consultation de son bulletin de notes (par trimestre/semestre)

- Visualisation de l\'emploi du temps de sa classe

- Accès aux ressources partagées par les enseignants

- Téléchargement de ses documents administratifs (certificats,
  attestations)

- Consultation de son historique d\'absences

- Messagerie avec les enseignants (fonctionnalité optionnelle selon
  règlement)

**1.6 Profil : Parent / Tuteur**

- Tableau de bord enfant : notes, absences, comportement, position dans
  la classe

- Alertes en temps réel : notification SMS/Push immédiate lors d\'une
  absence non justifiée

- Paiement des frais scolaires en ligne (Mobile Money, virement)

- Consultation des échéanciers et de l\'historique des paiements

- Messagerie sécurisée avec la direction et les enseignants

- Téléchargement des bulletins et relevés de notes

**1.7 Profil : Comptabilité / Économat**

- Émission et gestion des factures : frais de scolarité, transport,
  cantine, assurance

- Enregistrement des encaissements (espèces, Mobile Money, chèque,
  virement)

- Génération automatique des relances pour impayés (SMS, email,
  courrier)

- Gestion des bulletins de salaire du personnel (voir Image 4 ---
  bulletin de paie mensuel)

- Édition du cahier de paie mensuel (voir Image 6 --- Base des Cahiers
  de Paie)

- Rapports comptables : balance, journal de caisse, états de
  rapprochement

- Suivi de la masse salariale par niveau (Maternelle, Primaire, Collège,
  Lycée, Direction)

**SECTION 2 --- SPÉCIFICATIONS DES MODULES FONCTIONNELS**

**2.1 Module Inscription & Admissions**

**2.1.1 Workflow d\'Inscription (Tunnel de Validation)**

  -----------------------------------------------------------------------
  **WORKFLOW --- TUNNEL D\'INSCRIPTION**

  ÉTAPE 1 : Demande en ligne / Accueil physique

  → Saisie des informations de l\'élève (NOM, PRÉNOMS, DATE/LIEU
  NAISSANCE)

  → Choix du niveau souhaité (MPS, MMS, MGS, CP₁, CP₂, CE₁, CE₂\...)

  → Upload des pièces justificatives (acte de naissance, photos,
  bulletins)

  ÉTAPE 2 : Pré-inscription & Vérification

  → Génération d\'un numéro de dossier unique (NDD)

  → Vérification automatique : capacité de la classe cible disponible ?

  → Test de placement (si applicable, niveau collège/lycée)

  ÉTAPE 3 : Validation Administrative

  → Contrôle des pièces par le secrétariat (statut : Complet / Incomplet)

  → Notification parent : dossier reçu / pièce manquante

  → Décision : ACCEPTÉ / LISTE D\'ATTENTE / REFUSÉ

  ÉTAPE 4 : Inscription Définitive

  → Émission de la facture de premier paiement (frais d\'inscription)

  → Confirmation de paiement → Activation du compte élève

  → Affectation dans la classe → Génération du matricule
  -----------------------------------------------------------------------

**2.1.2 Réinscriptions Automatiques**

- Déclenchement automatique en fin d\'année scolaire (configurable par
  l\'admin)

- Reprise complète du dossier existant avec proposition de passage en
  classe supérieure

- Règle métier critique : si moyenne générale \< seuil de passage →
  alerte redoublement

- Envoi automatique d\'un lien de réinscription aux parents avec délai
  limite

- Archivage du dossier si non-renouvellement après 30 jours

**2.1.3 Pièces du Dossier Élève**

  -----------------------------------------------------------------------
  **Pièce**         **Format          **Obligatoire**   **Archivage**
                    Accepté**                           
  ----------------- ----------------- ----------------- -----------------
  Acte de naissance PDF, JPG, PNG     Oui               Coffre-fort
                                                        numérique chiffré

  Photo d\'identité JPG, PNG (max     Oui               Base de données
                    2MB)                                (blob)

  Bulletins années  PDF               Recommandé        Dossier
  passées                                               pédagogique

  Dossier médical / PDF               Oui (Maternelle)  Chiffré AES-256
  vaccins                                               

  Autorisation      PDF signé         Selon activités   GED interne
  parentale                                             

  Certificat de     PDF, JPG          Non               Dossier
  résidence                                             administratif
  -----------------------------------------------------------------------

**2.2 Module Pédagogique & Vie Scolaire**

**2.2.1 Structure Pédagogique --- Classes & Niveaux**

Le système doit prendre en charge la structure pédagogique complète
telle que définie dans la brochure statistique mensuelle (Image 3) :

  -----------------------------------------------------------------------
  **N°**            **Classe**        **Niveau**        **Cycle**
  ----------------- ----------------- ----------------- -----------------
  1                 MPS               Maternelle Petite Préscolaire
                                      Section           

  2                 MMS               Maternelle        Préscolaire
                                      Moyenne Section   

  3                 MGS               Maternelle Grande Préscolaire
                                      Section           

  4-5               CP₁ / CP₂         Cours             Primaire
                                      Préparatoire      

  6-9               CE₁, CE₂, CM₁,    Cours Élémentaire Primaire
                    CM₂               & Moyen           

  10                7ème A            Entrée au Collège Collège

  11-13             8ème A, 9ème A,   Collège           Collège
                    10ème A                             

  14-16             11ème SE/M, 12ème Lycée             Lycée
                    SS, 12ème SE/M                      

  17-19             TSS, TSE, TSM     Terminale         Lycée
  -----------------------------------------------------------------------

**2.2.2 Gestion Dynamique des Emplois du Temps**

- Création des créneaux horaires : journée découpée en périodes (ex:
  7h30-9h00, 9h00-10h30\...)

- Affectation enseignant-matière-classe sur un créneau

- Détection automatique de conflits (algorithme de contraintes) :

  - Conflit de salle : même salle affectée sur le même créneau

  - Conflit d\'enseignant : même prof sur deux classes simultanément

  - Conflit d\'élève : une classe dans deux salles en même temps

- Interface drag-and-drop pour la planification visuelle

- Publication et notification automatique aux enseignants et élèves

- Gestion des remplacements en cas d\'absence enseignant

**2.2.3 Gestion des Absences et Retards**

- Pointage par l\'enseignant en début de chaque cours (via
  tablette/mobile)

- Statuts possibles : PRÉSENT / ABSENT / RETARD / ABSENT JUSTIFIÉ

- Notification automatique immédiate au parent (Push + SMS) dès marquage
  d\'absence

- Justification d\'absence par le parent via l\'application avec upload
  de document

- Règle métier : au-delà de N absences injustifiées → alerte direction +
  convocation

- Rapport mensuel d\'assiduité par classe, par élève, par matière

**2.3 Module Évaluations, Notes & Bulletins**

**2.3.1 Types d\'Évaluations et Coefficients**

  ----------------------------------------------------------------------------------
  **Type**        **Abréviation**   **Coefficient**   **Fréquence**   **Impact
                                                                      Moyenne**
  --------------- ----------------- ----------------- --------------- --------------
  Devoir          DS                2                 Mensuel         Fort
  Surveillé                                                           

  Contrôle        CC                1                 Bimensuel       Moyen
  Continu                                                             

  Interrogation   IO                0.5               Hebdomadaire    Faible
  Orale                                                               

  Examen          EX                3                 Trimestriel     Très Fort
  Trimestriel                                                         

  Travaux         TP                1.5               Mensuel         Moyen
  Pratiques                                                           

  Projet / Exposé PR                1                 Semestriel      Moyen
  ----------------------------------------------------------------------------------

**2.3.2 Règles de Calcul des Moyennes**

  -----------------------------------------------------------------------
  **FORMULES DE CALCUL**

  // Moyenne d\'une matière sur un trimestre :

  MoyMatière = Σ(Note × Coefficient) / Σ(Coefficients)

  // Moyenne Générale Trimestrielle :

  MoyGénérale = Σ(MoyMatière × CoeffMatière) / Σ(CoeffMatières)

  // Rang dans la classe :

  Rang = RANK(MoyGénérale, \[toutes les moyennes de la classe\], DESC)

  // Décision de passage (configurable) :

  Passage = MoyGénérale \>= SeuilPassage (défaut: 10/20)

  // Mention :

  SI MoyGénérale \>= 16 → Très Bien

  SI MoyGénérale \>= 14 → Bien

  SI MoyGénérale \>= 12 → Assez Bien

  SI MoyGénérale \>= 10 → Passable

  SINON → Insuffisant
  -----------------------------------------------------------------------

**2.3.3 Génération de Bulletins PDF Personnalisables**

- Template de bulletin paramétrable (logo de l\'école, couleurs, entête,
  pied de page)

- Contenu dynamique : notes par matière, coefficient, moyenne, rang,
  appréciation de l\'enseignant

- Mention du conseil de classe, décision (admis/redoublant/passage
  conditionnel)

- Signature numérique du directeur (cachet électronique)

- Envoi automatique aux parents par email + disponible dans l\'espace
  parent

- Archivage automatique dans le dossier numérique de l\'élève

**2.4 Module Gestion Financière & Facturation**

**2.4.1 Structure des Frais Scolaires (Conforme aux Bulletins de Paie
Observés)**

D\'après l\'analyse du bulletin de salaire (Image 4), la structure
financière comprend les éléments suivants :

  -----------------------------------------------------------------------
  **Libellé**       **Imposable**     **Type**          **Description**
  ----------------- ----------------- ----------------- -----------------
  Salaire de Base   Oui               Personnel         Rémunération
                                                        contractuelle
                                                        mensuelle

  Indemnité         Non               Personnel         Indemnités de
                                                        transport,
                                                        logement, etc.

  Écolage           Non               Avantage          Réduction sur
  (déduction)                                           scolarité des
                                                        enfants du staff

  Cotisation        Non               Retenue           CNSS et autres
  Sociale                                               charges sociales

  Avance sur        Non               Retenue           Avances accordées
  Salaire                                               au cours du mois

  Révision / Bonus  Oui               Complément        Primes de
                                                        performance ou
                                                        révision
                                                        salariale

  Frais de          N/A               Recette           Paiement des
  Scolarité Élève                                       parents pour la
                                                        scolarité

  Frais de          N/A               Recette           Service de bus
  Transport                                             scolaire

  Frais de Cantine  N/A               Recette           Restauration
                                                        scolaire

  Frais             N/A               Recette           Assurance
  d\'Assurance                                          scolaire
                                                        obligatoire
  -----------------------------------------------------------------------

**2.4.2 Échéanciers de Paiement et Passerelles**

- Définition d\'un plan de paiement flexible : tranche unique,
  bimensuel, trimestriel

- Rappels automatiques J-7, J-3, J-0 avant échéance (SMS + Push)

- Intégration Mobile Money : Orange Money, MTN Mobile Money (API
  spécifique Guinée)

- Intégration paiement bancaire : virement BCRG, cartes Visa/Mastercard

- Génération de reçus numériques numérotés (format PDF + QR Code de
  vérification)

- Tableau de bord des impayés : liste filtrée par niveau, classe,
  montant, ancienneté

- Génération de lettres de relance automatisées (1er, 2ème, 3ème niveau)

- Alerte direction : blocage de l\'accès aux bulletins si impayés \>
  seuil configurable

**2.4.3 Gestion de la Masse Salariale (Conforme Image 1 & Image 6)**

Le module gère la masse salariale par niveau, conformément à la
structure \'Situations Économiques des Personnels Cible\' :

- Niveaux couverts : Maternelle, Primaire, Collège, Lycée, Direction

- Édition du cahier de paie mensuel (voir Image 6 : Base des Cahiers de
  Paie des Personnels)

- Colonnes gérées : Salaires, Écolages, Bons, Net à Payer, Établissement

- Calcul automatique du Net à Payer = Salaire de Base + Révision -
  Cotisations - Avances - Écolages

- Historique complet des bulletins par employé (consultable sur 5 ans)

**2.5 Module Communication & Notifications**

**2.5.1 Messagerie Interne Sécurisée**

- Boîte de réception filtrée par rôle : un enseignant ne voit que les
  messages de ses élèves/parents

- Fils de discussion par classe, par élève, ou généraux (annonces)

- Pièces jointes sécurisées (documents PDF, images)

- Marque-page et archivage des messages importants

- Accusé de lecture (lecture confirmée ou non)

**2.5.2 Système de Notifications Multicanal**

  ------------------------------------------------------------------------
  **Événement       **Canal**         **Destinataire**   **Délai**
  Déclencheur**                                          
  ----------------- ----------------- ------------------ -----------------
  Absence élève     Push + SMS        Parent             Immédiat
  constatée                                              

  Note              Push + Email      Élève + Parent     Immédiat
  saisie/publiée                                         

  Échéance paiement SMS + Email       Parent             J-7, J-3, J-0
  proche                                                 

  Bulletin          Push + Email      Parent + Élève     Publication
  disponible                                             

  Nouveau devoir    Push              Élève              Immédiat
  assigné                                                

  Réunion           SMS + Email       Parent             J-14, J-3
  parents-profs                                          

  Résultats examens Push + SMS        Élève + Parent     Publication

  Relance impayé    SMS + Email       Parent             Automatique
  ------------------------------------------------------------------------

**SECTION 3 --- ARCHITECTURE TECHNIQUE & MODÉLISATION DE DONNÉES**

**3.1 Architecture Recommandée : Monolithe Modulaire Multi-Tenant**

**3.1.1 Choix Architectural et Justification**

Pour une application SaaS scolaire multi-établissements au stade de la
croissance initiale, nous recommandons un Monolithe Modulaire (Modular
Monolith) plutôt qu\'une architecture Microservices, pour les raisons
suivantes :

  -----------------------------------------------------------------------
  **Critère**             **Monolithe Modulaire   **Microservices ❌
                          ✅**                    (prématuré)**
  ----------------------- ----------------------- -----------------------
  Complexité              Faible --- 1            Très élevée --- N
  opérationnelle          déploiement             services

  Coût infrastructure     Serveur unique ou PaaS  Kubernetes,
                          simple                  orchestration complexe

  Vitesse de              Rapide --- équipe       Lent --- overhead
  développement           petite/moyenne          inter-services

  Scalabilité initiale    Suffisante jusqu\'à     Nécessaire au-delà de
                          \~500 écoles            500 écoles

  Transactions ACID       Natives (1 base de      Complexes (saga, 2PC)
                          données)                

  Monitoring/Debug        Simple                  Nécessite tracing
                                                  distribué
  -----------------------------------------------------------------------

Migration path : L\'architecture modulaire est conçue pour permettre
l\'extraction progressive de microservices (ex: module Notifications,
module Paiement) lorsque l\'échelle le justifiera.

**3.1.2 Stratégie Multi-Tenant : Isolation des Données**

  -----------------------------------------------------------------------
  **STRATÉGIE RETENUE : Schéma Séparé par Tenant (Schema-per-Tenant)**

  Approche : Une base de données PostgreSQL unique,

  un schéma SQL distinct par établissement (école).

  Exemple :

  Base : sigs_production

  ├── schema: public → tables globales (tenants, plans, factures_reseau)

  ├── schema: ecole_cible_001 → données Cible du Formateur (Conakry)

  ├── schema: ecole_cible_002 → données Cible du Formateur (Matoto)

  └── schema: ecole_xyz_003 → données autre établissement

  Avantages :

  ✅ Isolation complète des données entre établissements

  ✅ Facilité de backup/restauration par tenant

  ✅ Conformité RGPD / droit à l\'oubli (DROP SCHEMA)

  ✅ Pas de risque de fuite cross-tenant via SQL

  Identification du tenant :

  → Via sous-domaine HTTP : matoto.cible-formateur.edu.gn

  → Via JWT token (claim: tenant_id)

  → Middleware d\'injection automatique du search_path PostgreSQL
  -----------------------------------------------------------------------

**3.1.3 Stack Technologique Recommandée**

  --------------------------------------------------------------------------
  **Couche**        **Technologie     **Alternative**   **Justification**
                    Recommandée**                       
  ----------------- ----------------- ----------------- --------------------
  Backend API       Node.js + NestJS  Laravel (PHP)     Typage fort,
                    (TypeScript)                        modulaire,
                                                        écosystème riche

  Base de Données   PostgreSQL 15+    MySQL 8           Schémas multiples,
                                                        JSON natif,
                                                        performances

  ORM               Prisma ou TypeORM Sequelize         Multi-schema
                                                        support, migrations
                                                        typées

  Cache             Redis 7           Memcached         Sessions, jobs
                                                        queue, rate limiting

  File Storage      MinIO             AWS S3            On-premise possible,
                    (S3-compatible)                     compatibilité S3

  Queue/Jobs        BullMQ (Redis)    RabbitMQ          Jobs async :
                                                        notifications,
                                                        bulletins PDF

  Frontend Web      Next.js 14        Vue.js 3 / Nuxt   SSR, performance,
                    (React)                             SEO admin

  Mobile            React Native /    Flutter           Code partagé
                    Expo                                iOS/Android, offline
                                                        support

  PDF Generation    Puppeteer +       PDFKit            Templates HTML → PDF
                    Handlebars                          fidèles

  Notifications     Firebase FCM +    OneSignal         Push
                    Twilio SMS                          multi-plateforme +
                                                        SMS

  Auth              JWT + Refresh     Session-based     Stateless,
                    Tokens                              compatible mobile

  DevOps            Docker + GitHub   GitLab CI         CI/CD automatisé
                    Actions                             
  --------------------------------------------------------------------------

**3.2 Modèle Conceptuel de Données (MCD --- Schéma ER)**

**3.2.1 Entités Principales**

  -----------------------------------------------------------------------
  **SCHÉMA ER --- ENTITÉS PRINCIPALES (Syntaxe Mermaid.js)**

  erDiagram

  TENANTS {

  uuid id PK

  string nom_etablissement

  string schema_name UK

  string sous_domaine UK

  string adresse

  string ire

  string dce

  string email_contact

  string telephone

  string logo_url

  enum statut \-- ACTIF\|SUSPENDU\|ESSAI

  date date_creation

  }

  ANNEES_SCOLAIRES {

  uuid id PK

  string libelle \-- \'2022-2023\'

  date date_debut

  date date_fin

  boolean est_courante

  }

  NIVEAUX {

  uuid id PK

  string code \-- \'MPS\', \'CP1\', \'7EME\'

  string libelle

  enum cycle \-- PRESCOLAIRE\|PRIMAIRE\|COLLEGE\|LYCEE

  int ordre_affichage

  }

  CLASSES {

  uuid id PK

  uuid niveau_id FK -\> NIVEAUX

  uuid annee_id FK -\> ANNEES_SCOLAIRES

  string nom \-- \'7ème A\', \'CM2 B\'

  int capacite_max

  uuid titulaire_id FK -\> PERSONNELS

  }

  PERSONNELS {

  uuid id PK

  string matricule UK

  string nom

  string prenom

  date date_naissance

  string lieu_naissance

  enum fonction \-- DIRECTEUR\|ENSEIGNANT\|COMPTABLE\|SECRETAIRE

  uuid niveau_id FK -\> NIVEAUX \-- niveau enseigné

  string email UK

  string telephone

  decimal salaire_base

  date date_engagement

  string cible_niveau \-- \'CIBLE 3\', \'QG\'

  }

  ELEVES {

  uuid id PK

  string matricule UK

  string nom

  string prenom

  date date_naissance

  string lieu_naissance

  string photo_url

  jsonb dossier_medical \-- chiffré AES-256

  string groupe_sanguin

  boolean actif

  }

  PARENTS_TUTEURS {

  uuid id PK

  string nom

  string prenom

  string telephone_1

  string telephone_2

  string email

  string profession

  enum lien_parente \-- PERE\|MERE\|TUTEUR\|AUTRE

  }

  INSCRIPTIONS {

  uuid id PK

  uuid eleve_id FK -\> ELEVES

  uuid classe_id FK -\> CLASSES

  uuid annee_id FK -\> ANNEES_SCOLAIRES

  uuid parent_id FK -\> PARENTS_TUTEURS

  enum statut \-- EN_COURS\|VALIDEE\|SUSPENDUE\|ARCHIVEE

  date date_inscription

  string numero_dossier UK

  jsonb pieces_jointes

  }

  MATIERES {

  uuid id PK

  string code

  string libelle

  decimal coefficient \-- coefficient de la matière

  uuid niveau_id FK -\> NIVEAUX

  }

  EVALUATIONS {

  uuid id PK

  uuid matiere_id FK -\> MATIERES

  uuid classe_id FK -\> CLASSES

  uuid enseignant_id FK -\> PERSONNELS

  enum type_eval \-- DS\|CC\|IO\|EX\|TP\|PR

  decimal coefficient_eval

  int trimestre \-- 1, 2 ou 3

  date date_evaluation

  string libelle

  decimal note_max \-- défaut: 20

  }

  NOTES {

  uuid id PK

  uuid evaluation_id FK -\> EVALUATIONS

  uuid eleve_id FK -\> ELEVES

  decimal valeur \-- la note obtenue

  string appreciation

  timestamp saisie_le

  uuid saisie_par FK -\> PERSONNELS

  }

  ABSENCES {

  uuid id PK

  uuid eleve_id FK -\> ELEVES

  uuid classe_id FK -\> CLASSES

  uuid matiere_id FK -\> MATIERES \-- optionnel

  date date_absence

  string creneau

  enum statut \-- ABSENT\|RETARD\|JUSTIFIE

  string motif

  string justificatif_url

  uuid signale_par FK -\> PERSONNELS

  }

  FACTURES {

  uuid id PK

  string numero UK \-- FAC-2026-00142

  uuid inscription_id FK -\> INSCRIPTIONS

  uuid annee_id FK -\> ANNEES_SCOLAIRES

  decimal montant_total

  decimal montant_paye

  decimal solde

  enum statut \-- EMISE\|PARTIELLE\|SOLDEE\|ANNULEE

  date date_emission

  date date_echeance

  jsonb details_lignes \-- \[{libelle, montant}, \...\]

  }

  PAIEMENTS {

  uuid id PK

  uuid facture_id FK -\> FACTURES

  decimal montant

  enum mode \-- ESPECES\|MOBILE_MONEY\|CHEQUE\|VIREMENT

  string reference_transaction

  timestamp date_paiement

  uuid encaisse_par FK -\> PERSONNELS

  string recu_numero UK

  }

  BULLETINS_SALAIRES {

  uuid id PK

  uuid personnel_id FK -\> PERSONNELS

  int mois \-- 1 à 12

  int annee

  decimal salaire_base

  decimal indemnites

  decimal ecolage

  decimal cotisation_sociale

  decimal avance

  decimal revision

  decimal net_a_payer

  enum mode_paiement \-- BILLETAGE\|VIREMENT\|MOBILE_MONEY

  string etablissement \-- \'QG\', \'CIBLE DE YIMBAY\'

  string telephone_paiement

  boolean est_paye

  timestamp paye_le

  }

  AUDIT_LOGS {

  uuid id PK

  uuid user_id FK -\> USERS

  string action \-- \'NOTE_CREATED\', \'PAYMENT_RECEIVED\'

  string resource_type \-- \'notes\', \'paiements\'

  uuid resource_id

  jsonb ancien_etat

  jsonb nouvel_etat

  string ip_address

  string user_agent

  timestamp created_at

  }
  -----------------------------------------------------------------------

**3.3 Sécurité et RGPD / Protection des Données**

**3.3.1 Stratégie de Chiffrement**

  -------------------------------------------------------------------------
  **Donnée**        **Méthode de      **Où stockée**      **Clé gérée par**
                    Chiffrement**                         
  ----------------- ----------------- ------------------- -----------------
  Mot de passe      bcrypt (cost=12)  Colonne             Non récupérable
  utilisateur                         \`password_hash\`   

  Dossier médical   AES-256-GCM       Colonne JSONB       KMS (clé par
  élève             (champ niveau)    chiffrée            tenant)

  Numéros de compte AES-256-GCM       Champ dédié chiffré KMS centralisé
  bancaire                                                

  Documents         Chiffrement       Object Storage      Clé serveur (SSE)
  uploadés (actes,  at-rest MinIO                         
  etc.)                                                   

  Communications    TLS 1.3           Transport           Certificat Let\'s
  API               obligatoire                           Encrypt

  Tokens JWT        RS256 (clé privée Cookie HttpOnly +   Rotation 90 jours
                    serveur)          Secure              

  Données de        Non stockées      Référence externe   Opérateur
  paiement Mobile   (tokenisation)                        (Orange, MTN)
  Money                                                   
  -------------------------------------------------------------------------

**3.3.2 Politique des Journaux d\'Audit (Audit Logs)**

- Toute action de création, modification, suppression est journalisée
  (table AUDIT_LOGS)

- Contenu du log : user_id, action, resource_type, resource_id,
  ancien_état, nouvel_état, IP, timestamp

- Logs immuables : aucun utilisateur, y compris l\'admin, ne peut
  modifier ou supprimer un log

- Conservation : 5 ans minimum (conformité légale Guinée)

- Accès restreint : consultation des logs réservée au Super Admin
  uniquement

- Alertes en temps réel : connexions depuis IP inconnues, tentatives
  d\'accès échouées (\>5 en 5min)

**3.3.3 Politique de Sécurité Applicative**

- Authentification forte : 2FA optionnel (TOTP) pour les rôles admin et
  comptable

- Rate Limiting : 100 requêtes/minute par IP sur les endpoints publics

- Protection CSRF : tokens CSRF sur toutes les mutations (formulaires)

- Validation d\'entrée : validation stricte côté serveur
  (class-validator), jamais côté client seul

- CORS : liste blanche des origines autorisées (domaines des
  établissements uniquement)

- Rotation automatique des tokens de refresh (Refresh Token Rotation)

- Politique de mots de passe : minimum 8 caractères, mixte
  chiffres/lettres/symboles

- Sessions inactives : déconnexion automatique après 30 minutes
  d\'inactivité

**3.3.4 Conformité RGPD / Droit Guinéen**

- Droit d\'accès : tout parent peut demander l\'export complet des
  données de son enfant (format JSON/PDF)

- Droit à l\'oubli : suppression du schéma complet possible lors de la
  résiliation d\'un établissement

- Consentement explicite : case de consentement cochée lors de
  l\'inscription en ligne

- Délégué à la Protection des Données (DPD) désigné dans
  l\'administration du réseau

- Registre des traitements : documentation automatique de tous les types
  de traitements de données

- Notification de violation : procédure documentée pour notification
  sous 72h en cas de fuite

**3.4 Plan de Déploiement et Environnements**

  ----------------------------------------------------------------------------
  **Environnement**   **Usage**         **Infrastructure**   **Base de
                                                             Données**
  ------------------- ----------------- -------------------- -----------------
  Développement (dev) Développeurs      Docker Compose local PostgreSQL local
                      locaux                                 

  Staging (pré-prod)  Tests QA & démos  VPS dédié (4 CPU,    PostgreSQL
                      clients           8GB RAM)             staging

  Production          Utilisation       VPS dédié (8 CPU,    PostgreSQL +
                      réelle            16GB RAM)            réplication

  Backup              Sauvegardes       Object Storage       Dump SQL chiffré
                      quotidiennes      (MinIO)              quotidien
  ----------------------------------------------------------------------------

**3.5 Roadmap de Développement Suggérée**

  -----------------------------------------------------------------------
  **Phase**         **Durée**         **Livrables**     **Priorité**
  ----------------- ----------------- ----------------- -----------------
  Phase 0 ---       4 semaines        Auth,             Critique
  Fondations                          multi-tenant,     
                                      RBAC, infra CI/CD 

  Phase 1 --- Core  8 semaines        Inscriptions,     Haute
  Scolarité                           classes, élèves,  
                                      emplois du temps  

  Phase 2 ---       6 semaines        Notes, bulletins  Haute
  Pédagogie                           PDF, absences,    
                                      cahier de texte   

  Phase 3 ---       6 semaines        Facturation,      Haute
  Finance                             paiements Mobile  
                                      Money, salaires   

  Phase 4 ---       4 semaines        Messagerie,       Moyenne
  Communication                       notifications     
                                      SMS/Push, portail 
                                      parent            

  Phase 5 ---       4 semaines        Tableaux de bord, Moyenne
  Reporting                           statistiques,     
                                      exports IRE/DCE   

  Phase 6 ---       8 semaines        App React Native  Normale
  Mobile                              (iOS/Android)     
                                      parent +          
                                      enseignant        
  -----------------------------------------------------------------------

*Document confidentiel --- Les Écoles La Cible du Formateur --- Conakry,
Guinée --- Arrêté N° 0202/MEN-A/CAB/2021 ---
lesecoleslacibleduformateur@gmail.com*
