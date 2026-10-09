import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Group, Paper, Progress, Select, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { fetchStatistiquesPaiements, type LigneStatistiquePaiement } from '../../api/finance';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function CarteGroupe({ titre, couleur, ligne }: { titre: string; couleur: string; ligne: LigneStatistiquePaiement }) {
  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="xs">
        <Text fw={700}>{titre}</Text>
        <Badge color={couleur} variant="light" size="lg">
          {ligne.effectif} élève{ligne.effectif > 1 ? 's' : ''}
        </Badge>
      </Group>

      <SimpleGrid cols={2} mb="sm">
        <div>
          <Text size="xs" c="dimmed">
            Payés
          </Text>
          <Text fw={700} size="xl" c="green">
            {ligne.payes}
          </Text>
        </div>
        <div>
          <Text size="xs" c="dimmed">
            Non payés
          </Text>
          <Text fw={700} size="xl" c={ligne.nonPayes > 0 ? 'red' : undefined}>
            {ligne.nonPayes}
          </Text>
          {ligne.dontPartiels > 0 && (
            <Text size="xs" c="dimmed">
              dont {ligne.dontPartiels} partiel{ligne.dontPartiels > 1 ? 's' : ''}
            </Text>
          )}
        </div>
      </SimpleGrid>

      <Text size="xs" c="dimmed">
        Restant à payer
      </Text>
      <Text fw={700} size="xl" c={ligne.totalRestant > 0 ? 'red' : 'green'}>
        {fmt(ligne.totalRestant)} GNF
      </Text>
      <Text size="xs" c="dimmed" mb={6}>
        encaissé {fmt(ligne.totalPaye)} sur {fmt(ligne.totalFacture)} GNF ({ligne.taux} %)
      </Text>
      <Progress value={ligne.taux} color={ligne.taux >= 80 ? 'green' : ligne.taux >= 50 ? 'yellow' : 'red'} />
      {ligne.sansFacture > 0 && (
        <Text size="xs" c="dimmed" mt={6}>
          {ligne.sansFacture} élève{ligne.sansFacture > 1 ? 's' : ''} sans facture
        </Text>
      )}
    </Paper>
  );
}

// Garçons et filles : payés, non payés et reste à payer, filtrables par niveau et par classe.
export function StatistiquesPaiements() {
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['dashboard-stats-paiements', niveauId, classeId],
    queryFn: () => fetchStatistiquesPaiements({ niveauId: niveauId ?? undefined, classeId: classeId ?? undefined }),
    placeholderData: keepPreviousData, // pas de clignotement quand on change de filtre
  });

  if (!data) return null;

  const classes = data.filtres.classes.filter((c) => !niveauId || c.niveauId === niveauId);

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={4}>Garçons et filles : paiements</Title>
            <Text size="sm" c="dimmed">
              Élèves inscrits, année {data.anneeScolaire.libelle}
            </Text>
          </div>
          <Group gap="sm">
            <Select
              label="Niveau"
              placeholder="Tous les niveaux"
              data={data.filtres.niveaux.map((n) => ({ value: n.id, label: n.nom }))}
              value={niveauId}
              onChange={(v) => {
                setNiveauId(v);
                // une classe d'un autre niveau n'a plus de sens
                if (classeId && v && !data.filtres.classes.some((c) => c.id === classeId && c.niveauId === v)) setClasseId(null);
              }}
              clearable
              w={{ base: '100%', sm: 200 }}
            />
            <Select
              label="Classe"
              placeholder="Toutes les classes"
              data={classes.map((c) => ({ value: c.id, label: c.nom }))}
              value={classeId}
              onChange={setClasseId}
              clearable
              w={{ base: '100%', sm: 200 }}
            />
          </Group>
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <CarteGroupe titre="Garçons" couleur="blue" ligne={data.garcons} />
          <CarteGroupe titre="Filles" couleur="grape" ligne={data.filles} />
          <CarteGroupe titre="Total" couleur="gray" ligne={data.total} />
        </SimpleGrid>
      </Stack>
    </Paper>
  );
}
