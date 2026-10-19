-- Prépare une base PostgreSQL vierge pour le déploiement chez UNE école : supprime toutes les données
-- (démonstration, essais...) puis crée l'école et son compte fondateur avec les valeurs saisies ci-dessous.
--
-- ATTENTION : suppression définitive et irréversible de TOUTES les données de la base. À n'exécuter que sur
-- une base de démonstration ou fraîchement migrée, jamais sur une base en service. Sauvegarde conseillée :
--
--   pg_dump -Fc -U kalanso -h localhost kalanso > sauvegarde-avant-preparation.dump
--
-- Avant de lancer le script :
--   1. la base doit être migrée :  npx prisma migrate deploy   (le script ne crée aucune table) ;
--   2. renseignez le bloc « PARAMÈTRES » ci-dessous, puis passez v_confirmer à true.
--
-- Le script est UNE SEULE instruction (le bloc DO ci-dessous), donc atomique : en cas d'erreur, rien n'est
-- modifié, et l'erreur affichée est la vraie cause (pas de transaction à moitié annulée). Exécutez-le en entier :
--
--   psql -v ON_ERROR_STOP=1 -U kalanso -h localhost -d kalanso -f preparer-base-pour-une-ecole.sql
--
-- ou collez-le dans pgAdmin / DBeaver / DataGrip et lancez tout le script. Le résultat s'affiche dans les
-- messages (NOTICE) : « Base préparée pour ... ».
--
-- Conservé : _prisma_migrations (historique des migrations, indispensable).
-- Après le script, l'école se connecte avec le compte fondateur et configure elle-même, dans l'application :
-- niveaux, année scolaire, classes, tarifs, personnel et comptes (voir le guide d'utilisation, chapitre 2).
-- Pensez aussi à vider le dossier backend/uploads (photos et pièces d'admission), que ce script ne touche pas.
-- Changez le mot de passe du fondateur à la première connexion et ne conservez pas ce fichier rempli.

DO $$
DECLARE
  -- ===================== PARAMÈTRES =====================
  v_confirmer       boolean := false;                    -- <-- passer à true pour autoriser la suppression
  v_ecole_id        text    := 'ecole-exemple';          -- identifiant dans l'adresse du formulaire public : /inscription/<identifiant>
                                                          --   (minuscules, chiffres et tirets ; ne plus le changer une fois diffusé aux familles)
  v_ecole_nom       text    := 'École Exemple';
  v_ecole_ville     text    := 'Conakry';
  v_fondateur_nom    text   := 'Nom';
  v_fondateur_prenom text   := 'Prénom';
  v_fondateur_email  text   := 'fondateur@exemple.org';
  v_fondateur_mdp    text   := 'a-remplacer-6-caracteres-minimum';
  -- ======================================================
  v_tables text;
BEGIN
  IF NOT v_confirmer THEN
    RAISE EXCEPTION 'Abandon : v_confirmer est à false. Ce script supprime TOUTES les données de la base ; passez-le à true pour continuer.';
  END IF;
  IF to_regclass('public.utilisateurs') IS NULL OR to_regclass('public.ecoles') IS NULL THEN
    RAISE EXCEPTION 'Abandon : la base n''est pas migrée. Lancez d''abord « npx prisma migrate deploy ».';
  END IF;
  IF v_ecole_id !~ '^[a-z0-9]+(-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Abandon : v_ecole_id « % » invalide (minuscules, chiffres et tirets, sans tiret en début ni en fin).', v_ecole_id;
  END IF;
  IF btrim(v_ecole_nom) = '' OR btrim(v_fondateur_nom) = '' OR btrim(v_fondateur_prenom) = '' THEN
    RAISE EXCEPTION 'Abandon : le nom de l''école et le nom et prénom du fondateur sont obligatoires.';
  END IF;
  IF v_fondateur_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'Abandon : adresse email « % » invalide.', v_fondateur_email;
  END IF;
  IF length(v_fondateur_mdp) < 6 THEN
    RAISE EXCEPTION 'Abandon : le mot de passe du fondateur doit compter au moins 6 caractères.';
  END IF;

  -- pgcrypto sert à hacher le mot de passe (bcrypt), comme le fait l'application.
  BEGIN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgcrypto';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE EXCEPTION 'Abandon : l''extension pgcrypto est absente et vous n''avez pas le droit de la créer. Faites-la créer une fois par un administrateur : « sudo -u postgres psql -d <base> -c ''CREATE EXTENSION pgcrypto'' », puis relancez ce script.';
  END;

  -- Toutes les tables de l'application (y compris celles des futures migrations), sauf l'historique des migrations.
  -- Elles sont toutes dans la même commande : les clés étrangères entre elles ne posent pas de problème.
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename <> '_prisma_migrations';

  EXECUTE 'TRUNCATE TABLE ' || v_tables;

  -- Les identifiants sont générés par l'application (cuid), pas par la base : on en fournit ici.
  INSERT INTO ecoles (id, nom, ville, actif, "createdAt", "updatedAt")
  VALUES (v_ecole_id, btrim(v_ecole_nom), NULLIF(btrim(v_ecole_ville), ''), true, now(), now());

  INSERT INTO utilisateurs (id, "ecoleId", nom, prenom, email, "motDePasseHash", role, actif, "createdAt", "updatedAt")
  VALUES (
    'c' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 24),
    v_ecole_id,
    btrim(v_fondateur_nom),
    btrim(v_fondateur_prenom),
    lower(btrim(v_fondateur_email)),
    crypt(v_fondateur_mdp, gen_salt('bf', 12)),   -- bcrypt, coût 12 : identique à l'application
    'FONDATEUR',
    true,
    now(),
    now()
  );

  RAISE NOTICE 'Base préparée pour « % » (identifiant %). Compte fondateur : %. Formulaire public d''admission : /inscription/%',
    btrim(v_ecole_nom), v_ecole_id, lower(btrim(v_fondateur_email)), v_ecole_id;
END $$;
