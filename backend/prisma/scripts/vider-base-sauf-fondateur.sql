-- Vide la base de données en ne conservant que le compte fondateur (et son école, que ce compte référence).
--
-- ATTENTION : suppression définitive et irréversible de toutes les autres données (élèves, finances, notes,
-- personnel, autres comptes, année scolaire, niveaux, classes, tarifs...). Faites une sauvegarde d'abord :
--
--   pg_dump -Fc -U kalanso -h localhost kalanso > sauvegarde-avant-vidage.dump
--
-- Le script est UNE SEULE instruction (le bloc DO ci-dessous), donc atomique : en cas d'erreur, rien n'est
-- supprimé, et l'erreur affichée est la vraie cause (pas de transaction à moitié annulée). Exécutez-le en entier :
--
--   psql -v ON_ERROR_STOP=1 -U kalanso -h localhost -d kalanso -f vider-base-sauf-fondateur.sql
--
-- ou collez-le dans pgAdmin / DBeaver / DataGrip et lancez tout le script. Le résultat s'affiche dans les
-- messages (NOTICE) : « Base vidée ... », avec les tables qui contiennent encore des lignes.
--
-- Conservé : les lignes du compte fondateur et de son école, ainsi que _prisma_migrations (historique des
-- migrations, indispensable). Après le vidage, il faut recréer l'année scolaire, les niveaux, les classes et
-- les tarifs avant de pouvoir admettre des élèves. Les fichiers déposés (backend/uploads) ne sont pas touchés.

DO $$
DECLARE
  v_email  text := 'fondateur@kalanso.gn';   -- <-- email du compte fondateur à conserver
  v_id     text;
  v_ecole  text;
  v_tables text;
  v_reste  text;
BEGIN
  SELECT id, "ecoleId" INTO v_id, v_ecole
  FROM utilisateurs
  WHERE email = v_email AND role = 'FONDATEUR';

  -- Garde-fou : sans fondateur, on ne supprime rien (la base resterait inutilisable).
  IF v_id IS NULL THEN
    RAISE EXCEPTION 'Aucun compte FONDATEUR avec l''email « % » : abandon, rien n''a été supprimé.', v_email;
  END IF;

  -- La table du personnel va être vidée : le fondateur ne doit plus y renvoyer.
  UPDATE utilisateurs SET "personnelId" = NULL WHERE id = v_id;

  -- Tous les autres comptes.
  DELETE FROM utilisateurs WHERE id <> v_id;

  -- Toutes les autres tables, y compris celles qui s'ajouteront aux prochaines migrations, sauf :
  --   ecoles, utilisateurs : conservées ; _prisma_migrations : historique des migrations ;
  --   personnels : référencée par utilisateurs, donc vidée par DELETE plus bas (TRUNCATE y est refusé).
  SELECT string_agg(format('%I.%I', schemaname, tablename), ', ')
  INTO v_tables
  FROM pg_tables
  WHERE schemaname = 'public'
    AND tablename NOT IN ('ecoles', 'utilisateurs', 'personnels', '_prisma_migrations');

  EXECUTE 'TRUNCATE TABLE ' || v_tables;

  DELETE FROM personnels;

  -- Les autres écoles (base multi-écoles) : plus rien ne les référence.
  DELETE FROM ecoles WHERE id <> v_ecole;

  -- Contrôle : seules ecoles (1), utilisateurs (1) et _prisma_migrations doivent encore contenir des lignes.
  SELECT string_agg(t || ' : ' || n, ', ' ORDER BY t)
  INTO v_reste
  FROM (
    SELECT table_name AS t,
           (xpath('/row/c/text()',
                  query_to_xml(format('SELECT count(*) AS c FROM %I.%I', table_schema, table_name), false, true, '')))[1]::text::int AS n
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  ) x
  WHERE n > 0;

  RAISE NOTICE 'Base vidée : compte % conservé (école %). Tables non vides : %', v_email, v_ecole, v_reste;
END $$;
