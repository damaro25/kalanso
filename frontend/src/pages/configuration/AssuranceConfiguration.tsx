import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Group, NumberInput, Paper, Select, SimpleGrid, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { fetchAnneesScolaires, libelleAnnee } from '../../api/classes';
import { enregistrerConfigurationAssurance, fetchConfigurationAssurance } from '../../api/assurance';

// Montant de l'assurance scolaire annuelle, par année : un montant pour tous les cycles et, au besoin, un montant
// propre à un cycle (vide : celui de tous les cycles s'applique).
export function AssuranceConfiguration({ modifiable }: { modifiable: boolean }) {
  const queryClient = useQueryClient();
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const [anneeId, setAnneeId] = useState<string | null>(null);
  const { data, isError } = useQuery({
    queryKey: ['assurance-configuration', anneeId],
    queryFn: () => fetchConfigurationAssurance(anneeId ?? undefined),
    retry: false,
  });
  const [tous, setTous] = useState<number | ''>('');
  const [parCycle, setParCycle] = useState<Record<string, number | ''>>({});

  useEffect(() => {
    if (!data) return;
    setTous(data.tousCycles ?? '');
    setParCycle(Object.fromEntries(data.parCycle.map((c) => [c.cycle, c.montant ?? ''])));
  }, [data]);

  const enregistrer = useMutation({
    mutationFn: () =>
      enregistrerConfigurationAssurance({
        anneeScolaireId: data!.anneeScolaire.id,
        tousCycles: tous === '' ? null : tous,
        parCycle: Object.entries(parCycle).map(([cycle, m]) => ({ cycle, montant: m === '' ? null : m })),
      }),
    onSuccess: (r) => {
      queryClient.setQueryData(['assurance-configuration', anneeId], r);
      queryClient.invalidateQueries({ queryKey: ['finance-assurance'] });
      notifications.show({ message: 'Montant du T-shirt enregistré', color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'enregistrement", color: 'red' }),
  });

  // Sans année scolaire, il n'y a pas de montant à saisir : on le dit au lieu de faire disparaître la carte.
  if (isError || (annees && annees.length === 0)) {
    return (
      <Paper withBorder p="md">
        <Title order={4} mb="xs">
          T-shirt
        </Title>
        <Alert color="yellow">
          Le montant du T-shirt se saisit pour une année scolaire, et aucune année n'existe pour le moment. Créez-la
          d'abord dans{' '}
          <Anchor component={Link} to="/classes">
            Classes &gt; Années scolaires
          </Anchor>{' '}
          (puis « Définir comme courante ») : ce cadre permettra ensuite de saisir le montant.
        </Alert>
      </Paper>
    );
  }
  if (!data) return null;
  const fige = !modifiable || data.anneeScolaire.cloturee;
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Title order={4}>T-shirt</Title>
        <Select
          data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
          value={anneeId ?? data.anneeScolaire.id}
          onChange={(v) => v && setAnneeId(v)}
          allowDeselect={false}
          w={200}
        />
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        T-shirt annuel, obligatoire : une facture « T-shirt {data.anneeScolaire.libelle} » par élève, créée avec ses
        factures d'inscription. Suivi et encaissement : Finances &gt; T-shirt.
      </Text>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        <NumberInput
          label="Montant (tous les cycles)"
          value={tous}
          onChange={(v) => setTous(typeof v === 'number' ? v : '')}
          min={0}
          allowDecimal={false}
          thousandSeparator=" "
          suffix=" GNF"
          readOnly={fige}
        />
        {data.parCycle.map((c) => (
          <NumberInput
            key={c.cycle}
            label={`${c.cycle} (facultatif)`}
            placeholder="Comme tous les cycles"
            value={parCycle[c.cycle] ?? ''}
            onChange={(v) => setParCycle((p) => ({ ...p, [c.cycle]: typeof v === 'number' ? v : '' }))}
            min={0}
            allowDecimal={false}
            thousandSeparator=" "
            suffix=" GNF"
            readOnly={fige}
          />
        ))}
      </SimpleGrid>
      {!fige && (
        <Group mt="md">
          <Button loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            Enregistrer le montant du T-shirt
          </Button>
        </Group>
      )}
    </Paper>
  );
}
