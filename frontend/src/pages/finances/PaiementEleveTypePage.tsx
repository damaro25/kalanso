import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Anchor,
  Badge,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  Title,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { IconEye } from "@tabler/icons-react";
import { fetchEleveFiche, fetchEleves } from "../../api/eleves";
import { fetchAnneesScolaires, fetchClassesCourantes } from "../../api/classes";
import {
  createPaiement,
  ouvrirFacturePdf,
  ouvrirRecu,
} from "../../api/finances";
import { usePendingIds } from "../../offline/outbox";
import { AssuranceEleve } from "../eleves/AssuranceEleve";
import { FormationsEleve } from "../eleves/FormationsEleve";
import { useAuth } from "../../auth/AuthContext";

type TypePaiement = "ASSURANCE" | "FORMATION";

const MODES = [
  { value: "ESPECES", label: "Espèces" },
  { value: "VIREMENT", label: "Virement" },
  { value: "CHEQUE", label: "Chèque" },
  { value: "AUTRE", label: "Autre" },
];

const STATUTS: Record<string, { label: string; color: string }> = {
  IMPAYEE: { label: "Impayée", color: "red" },
  PARTIELLE: { label: "Partielle", color: "orange" },
  PAYEE: { label: "Payée", color: "green" },
  ANNULEE: { label: "Annulée", color: "gray" },
};

const fmt = (n: number) => n.toLocaleString("fr-FR");

// Paiement de l'assurance scolaire ou des formations supplémentaires (menu Finances) : on choisit l'élève, on voit
// sa situation et ses factures de ce type, puis on encaisse avec reçu. Ces blocs ne sont plus sur la fiche élève.
export function PaiementEleveTypePage({ type }: { type: TypePaiement }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const idsEnAttente = usePendingIds();
  const [classeId, setClasseId] = useState<string | null>(null);
  const [eleveId, setEleveId] = useState<string | null>(null);
  const [facture, setFacture] = useState<{
    id: string;
    libelle: string;
    reste: number;
  } | null>(null);
  const [montant, setMontant] = useState<number | "">("");
  const [mode, setMode] = useState<string | null>("ESPECES");
  const [dernierPaiementId, setDernierPaiementId] = useState<string | null>(
    null,
  );

  const { data: eleves } = useQuery({
    queryKey: ["eleves", "liste", null, null],
    queryFn: () => fetchEleves(),
  });
  const { data: classes } = useQuery({
    queryKey: ["classes", "courante"],
    queryFn: fetchClassesCourantes,
  });
  const { data: annees } = useQuery({
    queryKey: ["annees-scolaires"],
    queryFn: fetchAnneesScolaires,
  });
  const anneeCourante = annees?.find((a) => a.courante);
  const { data: fiche } = useQuery({
    queryKey: ["eleve-fiche", eleveId],
    queryFn: () => fetchEleveFiche(eleveId!),
    enabled: !!eleveId,
  });

  const optionsEleves = useMemo(
    () =>
      (eleves ?? [])
        .filter((e) => !classeId || e.classe?.id === classeId)
        .map((e) => ({
          value: e.id,
          label: `${e.nom} ${e.prenom}${e.matricule ? ` (${e.matricule})` : ""}${e.classe ? ` - ${e.classe.nom}` : ""}`,
        })),
    [eleves, classeId],
  );

  const factures: any[] = (fiche?.factures ?? []).filter(
    (f: any) => f.type === type && f.statut !== "ANNULEE",
  );

  const paiement = useMutation({
    mutationFn: () =>
      createPaiement({
        factureId: facture!.id,
        montant: Number(montant),
        mode: mode as any,
      }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ["eleve-fiche", eleveId] });
      queryClient.invalidateQueries({ queryKey: ["factures-impayes"] });
      queryClient.invalidateQueries({
        queryKey: ["finance-assurance-eleve", eleveId],
      });
      queryClient.invalidateQueries({
        queryKey: ["formations-eleve", eleveId],
      });
      notifications.show({ message: "Paiement enregistré", color: "green" });
      setDernierPaiementId(p.id);
      setMontant("");
    },
    onError: (e: any) =>
      notifications.show({
        message:
          e?.response?.data?.message ??
          "Erreur lors de l'enregistrement du paiement",
        color: "red",
      }),
  });

  const titre =
    type === "ASSURANCE"
      ? `Paiement T-shirt${anneeCourante ? ` ${anneeCourante.libelle}` : ""}`
      : "Paiement formations supplémentaires";

  return (
    <Stack>
      <div>
        <Title order={2}>{titre}</Title>
        <Text c="dimmed" size="sm">
          Choisissez l'élève, puis encaissez sa facture{" "}
          {type === "ASSURANCE" ? "de T-shirt" : "de formation"} : un reçu est
          généré.
        </Text>
      </div>

      <Group align="flex-end" gap="sm">
        <Select
          label="Classe"
          placeholder="Toutes les classes"
          data={(classes ?? []).map((c) => ({
            value: c.id,
            label: `${c.nom} (${c.niveau.nom})`,
          }))}
          value={classeId}
          onChange={(v) => {
            setClasseId(v);
            // l'élève choisi n'est plus dans la liste s'il n'est pas de cette classe
            if (
              v &&
              eleveId &&
              eleves?.find((e) => e.id === eleveId)?.classe?.id !== v
            )
              setEleveId(null);
          }}
          searchable
          clearable
          w={{ base: "100%", sm: 240 }}
        />
        <Select
          label="Élève"
          placeholder="Rechercher par nom, matricule ou classe"
          data={optionsEleves}
          value={eleveId}
          onChange={setEleveId}
          searchable
          clearable
          nothingFoundMessage="Aucun élève"
          w={{ base: "100%", sm: 420 }}
        />
      </Group>

      {eleveId && fiche && (
        <>
          <Group justify="space-between">
            <Text fw={600}>
              {fiche.prenom} {fiche.nom}
              {fiche.inscriptions?.[0]
                ? ` - ${fiche.inscriptions[0].classe.nom}`
                : ""}
            </Text>
            <Anchor component={Link} to={`/eleves/${eleveId}`} size="sm">
              Voir la fiche
            </Anchor>
          </Group>

          {type === "ASSURANCE" ? (
            <AssuranceEleve eleveId={eleveId} />
          ) : (
            <FormationsEleve
              eleveId={eleveId}
              peutFacturer={
                user?.role === "FONDATEUR" ||
                user?.role === "CHEF_ETABLISSEMENT" ||
                user?.role === "COMPTABLE"
              }
            />
          )}

          <Paper withBorder p="md">
            <Title order={4} mb="sm">
              Factures {type === "ASSURANCE" ? "de T-shirt" : "de formations"}
            </Title>
            {factures.length === 0 && (
              <Text c="dimmed">Aucune facture pour cet élève.</Text>
            )}
            {factures.map((f) => {
              const reste = Number(f.montantTotal) - Number(f.montantPaye);
              const statut = STATUTS[f.statut] ?? {
                label: f.statut,
                color: "gray",
              };
              return (
                <Stack key={f.id} mb="sm" gap={4}>
                  <Group justify="space-between">
                    <Group gap="xs">
                      <Text>
                        {f.libelle} : {fmt(Number(f.montantTotal))} GNF
                      </Text>
                      <Badge color={statut.color} variant="light">
                        {statut.label}
                      </Badge>
                      {reste > 0 && f.statut !== "IMPAYEE" && (
                        <Text size="sm" c="dimmed">
                          reste {fmt(reste)} GNF
                        </Text>
                      )}
                    </Group>
                    <Group gap="xs">
                      {(f.statut === "IMPAYEE" || f.statut === "PARTIELLE") && (
                        <Button
                          size="xs"
                          onClick={() => {
                            setFacture({ id: f.id, libelle: f.libelle, reste });
                            setMontant(reste);
                            setDernierPaiementId(null);
                          }}
                        >
                          Encaisser
                        </Button>
                      )}
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconEye size={14} stroke={1.5} />}
                        onClick={() => ouvrirFacturePdf(f.id)}
                      >
                        Voir la facture
                      </Button>
                    </Group>
                  </Group>
                  {f.paiements.map((p: any) => (
                    <Group key={p.id} justify="space-between" ml="md">
                      <Text size="sm" c="dimmed">
                        {new Date(p.datePaiement).toLocaleDateString("fr-FR")} :{" "}
                        {fmt(Number(p.montant))} GNF ({p.mode})
                      </Text>
                      <Button
                        size="xs"
                        variant="subtle"
                        leftSection={<IconEye size={14} stroke={1.5} />}
                        onClick={() => ouvrirRecu(p.id)}
                      >
                        Voir le reçu
                      </Button>
                    </Group>
                  ))}
                </Stack>
              );
            })}
          </Paper>
        </>
      )}

      <Modal
        opened={!!facture}
        onClose={() => {
          setFacture(null);
          setDernierPaiementId(null);
        }}
        title={facture ? `Encaisser : ${facture.libelle}` : ""}
      >
        <Stack>
          {facture && (
            <Text size="sm" c="dimmed">
              Reste à payer : {fmt(facture.reste)} GNF
            </Text>
          )}
          <NumberInput
            label="Montant (GNF)"
            value={montant}
            onChange={(v) => setMontant(v === "" ? "" : Number(v))}
            min={0}
            thousandSeparator=" "
          />
          <Select
            label="Mode de paiement"
            data={MODES}
            value={mode}
            onChange={setMode}
            allowDeselect={false}
          />
          <Button
            disabled={!montant}
            loading={paiement.isPending}
            onClick={() => paiement.mutate()}
          >
            Enregistrer le paiement
          </Button>
          {dernierPaiementId && (
            <Tooltip
              label="Disponible une fois le paiement synchronisé"
              disabled={!idsEnAttente.has(dernierPaiementId)}
            >
              <Button
                variant="light"
                disabled={idsEnAttente.has(dernierPaiementId)}
                onClick={() => ouvrirRecu(dernierPaiementId)}
              >
                Voir le reçu
              </Button>
            </Tooltip>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
