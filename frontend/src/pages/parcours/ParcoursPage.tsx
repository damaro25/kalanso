import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Stack, Select, Table, Badge, Text, Button, Group, Alert, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchClasses } from '../../api/classes';
import { fetchParcoursClasse, fetchDestinationsClasse, validerPassage, type Decision } from '../../api/parcours';

const DECISION_COLORS: Record<Decision, string> = {
  ADMIS: 'green',
  REDOUBLE: 'red',
  INDETERMINEE: 'gray',
};

const DECISION_LABELS: Record<Decision, string> = {
  ADMIS: 'Passage classe sup.',
  REDOUBLE: 'Redouble',
  INDETERMINEE: 'Données insuffisantes',
};

function formatMoyenne(m: number | null): string {
  return m === null ? '—' : m.toFixed(2);
}

export function ParcoursPage() {
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [classeId, setClasseId] = useState<string | null>(null);

  const { data: parcoursData, isLoading: chargementParcours } = useQuery({
    queryKey: ['parcours', classeId],
    queryFn: () => fetchParcoursClasse(classeId!),
    enabled: !!classeId,
  });

  const { data: destinationsData } = useQuery({
    queryKey: ['parcours-destinations', classeId],
    queryFn: () => fetchDestinationsClasse(classeId!),
    enabled: !!classeId,
  });

  const [destinations, setDestinations] = useState<Record<string, string | null>>({});

  useEffect(() => {
    if (!parcoursData || !destinationsData) return;
    const defauts: Record<string, string | null> = {};
    for (const ligne of parcoursData.parcours) {
      const niveauCible =
        ligne.decision === 'ADMIS' && destinationsData.niveauSuperieur
          ? destinationsData.niveauSuperieur.id
          : destinationsData.niveauActuel.id;
      const classeParDefaut = destinationsData.classesDisponibles.find((c) => c.niveauId === niveauCible);
      defauts[ligne.eleve.id] = classeParDefaut?.id ?? null;
    }
    setDestinations(defauts);
  }, [parcoursData, destinationsData]);

  const validerMutation = useMutation({
    mutationFn: () =>
      validerPassage(
        Object.entries(destinations)
          .filter(([, classeDestinationId]) => !!classeDestinationId)
          .map(([eleveId, classeDestinationId]) => ({ eleveId, classeDestinationId: classeDestinationId! })),
      ),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['parcours', classeId] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      if (result.echecs.length === 0) {
        notifications.show({ message: `${result.reussies} élève(s) passé(s) en classe suivante`, color: 'green' });
      } else {
        notifications.show({
          message: `${result.reussies} élève(s) traité(s), ${result.echecs.length} échec(s) : ${result.echecs
            .map((e) => e.erreur)
            .join(', ')}`,
          color: 'orange',
        });
      }
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  const nbSelections = Object.values(destinations).filter(Boolean).length;
  const aucuneDestinationDisponible = !!destinationsData && destinationsData.classesDisponibles.length === 0;

  return (
    <Stack>
      <Title order={2}>Suivi de parcours</Title>
      <Text c="dimmed" size="sm">
        Décide du passage en classe supérieure à partir des moyennes des 3 trimestres. Seuil de passage :
        moyenne annuelle ≥ 5/10.
      </Text>

      <Select
        label="Classe"
        placeholder="Choisir une classe"
        data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom} · ${c.anneeScolaire.libelle})` }))}
        value={classeId}
        onChange={setClasseId}
        w={320}
      />

      {chargementParcours && <Text>Chargement...</Text>}

      {classeId && aucuneDestinationDisponible && (
        <Alert color="orange" title="Aucune classe de destination disponible">
          Il n'existe encore aucune classe (niveau actuel ou supérieur) pour une autre année scolaire.
          Créez d'abord la nouvelle année scolaire et ses classes depuis la page{' '}
          <Anchor component={Link} to="/classes">
            Classes
          </Anchor>
          .
        </Alert>
      )}

      {parcoursData && parcoursData.parcours.length === 0 && (
        <Text c="dimmed">Aucun élève inscrit dans cette classe.</Text>
      )}

      {parcoursData && parcoursData.parcours.length > 0 && (
        <Stack>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élève</Table.Th>
                <Table.Th>T1</Table.Th>
                <Table.Th>T2</Table.Th>
                <Table.Th>T3</Table.Th>
                <Table.Th>Moyenne annuelle</Table.Th>
                <Table.Th>Décision</Table.Th>
                <Table.Th>Classe destination</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {parcoursData.parcours.map((ligne) => (
                <Table.Tr key={ligne.eleve.id}>
                  <Table.Td>
                    {ligne.eleve.prenom} {ligne.eleve.nom}
                  </Table.Td>
                  <Table.Td>{formatMoyenne(ligne.moyenneTrimestre1)}</Table.Td>
                  <Table.Td>{formatMoyenne(ligne.moyenneTrimestre2)}</Table.Td>
                  <Table.Td>{formatMoyenne(ligne.moyenneTrimestre3)}</Table.Td>
                  <Table.Td>
                    <strong>{formatMoyenne(ligne.moyenneAnnuelle)}</strong>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={DECISION_COLORS[ligne.decision]}>{DECISION_LABELS[ligne.decision]}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Select
                      placeholder="Aucune (ignorer)"
                      data={(destinationsData?.classesDisponibles ?? []).map((c) => ({
                        value: c.id,
                        label: `${c.nom} (${c.niveau.nom} · ${c.anneeScolaire.libelle})`,
                      }))}
                      value={destinations[ligne.eleve.id] ?? null}
                      onChange={(v) => setDestinations((prev) => ({ ...prev, [ligne.eleve.id]: v }))}
                      clearable
                      w={260}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>

          <Group>
            <Button
              disabled={nbSelections === 0}
              loading={validerMutation.isPending}
              onClick={() => validerMutation.mutate()}
            >
              Confirmer le passage ({nbSelections} élève(s))
            </Button>
          </Group>
        </Stack>
      )}
    </Stack>
  );
}
