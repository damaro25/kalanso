import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table, Title, Group, Paper, TextInput, NumberInput, Button, Stack, Text, Modal, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  fetchNiveaux,
  createNiveau,
  updateNiveau,
  deleteNiveau,
  type Niveau,
} from '../../api/classes';

export function NiveauxPage() {
  const queryClient = useQueryClient();
  const { data: niveaux, isLoading } = useQuery({ queryKey: ['niveaux'], queryFn: fetchNiveaux });

  const [nom, setNom] = useState('');
  const [cycle, setCycle] = useState('');
  const [ordre, setOrdre] = useState<number | ''>('');

  const mutation = useMutation({
    mutationFn: () =>
      createNiveau({
        nom,
        cycle: cycle || undefined,
        ordre: ordre === '' ? undefined : Number(ordre),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niveaux'] });
      notifications.show({ message: 'Niveau créé', color: 'green' });
      setNom('');
      setCycle('');
      setOrdre('');
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la création', color: 'red' }),
  });

  // Édition d'un niveau existant
  const [niveauEnEdition, setNiveauEnEdition] = useState<Niveau | null>(null);
  const [nomEdition, setNomEdition] = useState('');
  const [cycleEdition, setCycleEdition] = useState('');
  const [ordreEdition, setOrdreEdition] = useState<number | ''>('');

  function ouvrirEdition(n: Niveau) {
    setNiveauEnEdition(n);
    setNomEdition(n.nom);
    setCycleEdition(n.cycle ?? '');
    setOrdreEdition(n.ordre);
  }

  const editionMutation = useMutation({
    mutationFn: () =>
      updateNiveau(niveauEnEdition!.id, {
        nom: nomEdition,
        cycle: cycleEdition || undefined,
        ordre: ordreEdition === '' ? undefined : Number(ordreEdition),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niveaux'] });
      notifications.show({ message: 'Niveau modifié', color: 'green' });
      setNiveauEnEdition(null);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  const suppressionMutation = useMutation({
    mutationFn: (id: string) => deleteNiveau(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['niveaux'] });
      notifications.show({ message: 'Niveau supprimé', color: 'green' });
    },
    onError: (error: any) =>
      notifications.show({
        message: error?.response?.data?.message ?? 'Erreur lors de la suppression (le niveau est peut-être encore utilisé)',
        color: 'red',
      }),
  });

  function confirmerSuppression(n: Niveau) {
    if (window.confirm(`Supprimer le niveau "${n.nom}" ? Cette action est irréversible.`)) {
      suppressionMutation.mutate(n.id);
    }
  }

  return (
    <Stack>
      <Title order={2}>Niveaux</Title>
      <Text size="sm" c="dimmed">
        Les niveaux (ex: CP1, CM2, 6eme) structurent les classes, les tarifs d'écolage et les frais
        d'inscription. L'ordre détermine leur affichage dans les listes.
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Nouveau niveau
        </Title>
        <Group>
          <TextInput placeholder="Nom (ex: 6eme)" value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
          <TextInput placeholder="Cycle (ex: Collège)" value={cycle} onChange={(e) => setCycle(e.currentTarget.value)} />
          <NumberInput placeholder="Ordre" value={ordre} onChange={(v) => setOrdre(v === '' ? '' : Number(v))} />
          <Button disabled={!nom} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Créer
          </Button>
        </Group>
      </Paper>

      {isLoading && <p>Chargement...</p>}

      {niveaux && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Ordre</Table.Th>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Cycle</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {niveaux.map((n) => (
              <Table.Tr key={n.id}>
                <Table.Td>{n.ordre}</Table.Td>
                <Table.Td>{n.nom}</Table.Td>
                <Table.Td>{n.cycle ?? '—'}</Table.Td>
                <Table.Td>
                  <Group gap="md">
                    <Anchor component="button" type="button" size="sm" onClick={() => ouvrirEdition(n)}>
                      Modifier
                    </Anchor>
                    <Anchor component="button" type="button" size="sm" c="red" onClick={() => confirmerSuppression(n)}>
                      Supprimer
                    </Anchor>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!niveauEnEdition} onClose={() => setNiveauEnEdition(null)} title="Modifier le niveau">
        <Stack>
          <TextInput label="Nom" value={nomEdition} onChange={(e) => setNomEdition(e.currentTarget.value)} />
          <TextInput label="Cycle" value={cycleEdition} onChange={(e) => setCycleEdition(e.currentTarget.value)} />
          <NumberInput label="Ordre" value={ordreEdition} onChange={(v) => setOrdreEdition(v === '' ? '' : Number(v))} />
          <Button disabled={!nomEdition} loading={editionMutation.isPending} onClick={() => editionMutation.mutate()}>
            Enregistrer
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
