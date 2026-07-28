import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table, Title, Group, Paper, TextInput, Select, NumberInput, Button, Stack, Text, Modal, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { confirmerSuppression } from '../../lib/confirm';
import { fetchMatieres, createMatiere, updateMatiere, deleteMatiere, type Matiere } from '../../api/notes';
import { fetchNiveaux } from '../../api/classes';

export function MatieresPage() {
  const queryClient = useQueryClient();
  const { data: niveaux } = useQuery({ queryKey: ['niveaux'], queryFn: fetchNiveaux });

  const [filtreNiveauId, setFiltreNiveauId] = useState<string | null>(null);
  const { data: matieres, isLoading } = useQuery({
    queryKey: ['matieres-toutes', filtreNiveauId],
    queryFn: () => fetchMatieres(filtreNiveauId ?? undefined),
  });

  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [nom, setNom] = useState('');
  const [coefficient, setCoefficient] = useState<number | ''>('');

  function invalider() {
    queryClient.invalidateQueries({ queryKey: ['matieres-toutes'] });
    queryClient.invalidateQueries({ queryKey: ['matieres'] });
  }

  const mutation = useMutation({
    mutationFn: () => createMatiere({ niveauId: niveauId!, nom, coefficient: Number(coefficient) }),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Matière créée', color: 'green' });
      setNom('');
      setCoefficient('');
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la création', color: 'red' }),
  });

  // Édition d'une matière existante
  const [matiereEnEdition, setMatiereEnEdition] = useState<Matiere | null>(null);
  const [nomEdition, setNomEdition] = useState('');
  const [coefficientEdition, setCoefficientEdition] = useState<number | ''>('');

  function ouvrirEdition(m: Matiere) {
    setMatiereEnEdition(m);
    setNomEdition(m.nom);
    setCoefficientEdition(Number(m.coefficient));
  }

  const editionMutation = useMutation({
    mutationFn: () =>
      updateMatiere(matiereEnEdition!.id, { nom: nomEdition, coefficient: Number(coefficientEdition) }),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Matière modifiée', color: 'green' });
      setMatiereEnEdition(null);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  const suppressionMutation = useMutation({
    mutationFn: (id: string) => deleteMatiere(id),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Matière supprimée', color: 'green' });
    },
    onError: (error: any) =>
      notifications.show({
        message: error?.response?.data?.message ?? 'Erreur lors de la suppression (la matière est peut-être encore utilisée)',
        color: 'red',
      }),
  });

  return (
    <Stack>
      <Title order={2}>Matières</Title>
      <Text size="sm" c="dimmed">
        Les matières sont définies par niveau (ex: Mathématiques en CM1) et servent à la saisie des notes,
        aux bulletins et à l'emploi du temps. Le coefficient détermine leur poids dans le calcul des
        moyennes.
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Nouvelle matière
        </Title>
        <Group>
          <Select
            placeholder="Niveau"
            data={(niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
            value={niveauId}
            onChange={setNiveauId}
          />
          <TextInput placeholder="Nom (ex: Mathématiques)" value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
          <NumberInput
            placeholder="Coefficient"
            min={0}
            value={coefficient}
            onChange={(v) => setCoefficient(v === '' ? '' : Number(v))}
            w={140}
          />
          <Button
            disabled={!niveauId || !nom || !coefficient}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Créer
          </Button>
        </Group>
      </Paper>

      <Select
        label="Filtrer par niveau"
        placeholder="Tous les niveaux"
        data={(niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
        value={filtreNiveauId}
        onChange={setFiltreNiveauId}
        clearable
        w={260}
      />

      {isLoading && <p>Chargement...</p>}

      {matieres && matieres.length === 0 && <Text c="dimmed">Aucune matière définie.</Text>}

      {matieres && matieres.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Niveau</Table.Th>
              <Table.Th>Matière</Table.Th>
              <Table.Th>Coefficient</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {matieres.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{m.niveau.nom}</Table.Td>
                <Table.Td>{m.nom}</Table.Td>
                <Table.Td>{Number(m.coefficient)}</Table.Td>
                <Table.Td>
                  <Group gap="md">
                    <Anchor component="button" type="button" size="sm" onClick={() => ouvrirEdition(m)}>
                      Modifier
                    </Anchor>
                    <Anchor
                      component="button"
                      type="button"
                      size="sm"
                      c="red"
                      onClick={() =>
                        confirmerSuppression({
                          message: `Voulez-vous vraiment supprimer « ${m.nom} » (${m.niveau.nom}) ? Cette action est définitive.`,
                          onConfirm: () => suppressionMutation.mutate(m.id),
                        })
                      }
                    >
                      Supprimer
                    </Anchor>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!matiereEnEdition} onClose={() => setMatiereEnEdition(null)} title="Modifier la matière">
        <Stack>
          {matiereEnEdition && (
            <Text size="sm" c="dimmed">
              Niveau : {matiereEnEdition.niveau.nom}
            </Text>
          )}
          <TextInput label="Nom" value={nomEdition} onChange={(e) => setNomEdition(e.currentTarget.value)} />
          <NumberInput
            label="Coefficient"
            min={0}
            value={coefficientEdition}
            onChange={(v) => setCoefficientEdition(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!nomEdition || !coefficientEdition}
            loading={editionMutation.isPending}
            onClick={() => editionMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
