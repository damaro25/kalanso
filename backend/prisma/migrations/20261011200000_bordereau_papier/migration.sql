-- Signataires du bordereau journalier, et premier N° de reçu (pour continuer le carnet papier)
ALTER TABLE "ecoles" ADD COLUMN "nomDirecteur" TEXT,
ADD COLUMN "nomComptable" TEXT,
ADD COLUMN "numeroRecuDepart" INTEGER;

-- N° de reçu séquentiel par école : les paiements existants sont numérotés dans l'ordre d'encaissement
ALTER TABLE "paiements" ADD COLUMN "numero" INTEGER;

UPDATE "paiements" p
SET "numero" = s.rang
FROM (
  SELECT "id", ROW_NUMBER() OVER (PARTITION BY "ecoleId" ORDER BY "datePaiement", "createdAt", "id") AS rang
  FROM "paiements"
) s
WHERE p."id" = s."id";

CREATE UNIQUE INDEX "paiements_ecoleId_numero_key" ON "paiements"("ecoleId", "numero");

-- Les nouveaux paiements reçoivent le numéro suivant de leur école, au moins son « numeroRecuDepart ».
-- Le verrou par école évite que deux encaissements simultanés prennent le même numéro.
CREATE FUNCTION numeroter_paiement() RETURNS trigger AS $$
BEGIN
  IF NEW."numero" IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('numero_recu:' || NEW."ecoleId"));
    SELECT GREATEST(
      COALESCE(MAX("numero"), 0) + 1,
      COALESCE((SELECT "numeroRecuDepart" FROM "ecoles" WHERE "id" = NEW."ecoleId"), 1)
    ) INTO NEW."numero"
    FROM "paiements" WHERE "ecoleId" = NEW."ecoleId";
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER paiements_numero
BEFORE INSERT ON "paiements"
FOR EACH ROW EXECUTE FUNCTION numeroter_paiement();
