import { useQuery } from '@tanstack/react-query';
import { Title, SimpleGrid, Paper, Text, Group, Button, Stack } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchDashboard, telechargerExportEleves, telechargerExportImpayes } from '../../api/reporting';

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {value}
      </Text>
    </Paper>
  );
}

export function DashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });

  if (isLoading || !data) return <p>Chargement...</p>;

  const absencesChartData = [
    { nom: 'Présents', valeur: data.absencesAujourdhui.presents },
    { nom: 'Absents', valeur: data.absencesAujourdhui.absents },
    { nom: 'Retards', valeur: data.absencesAujourdhui.retards },
  ];

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Tableau de bord</Title>
          <Text c="dimmed" size="sm">
            Année scolaire {data.anneeScolaire.libelle}
          </Text>
        </div>
        <Group>
          <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerExportEleves()}>
            Télécharger la liste des élèves
          </Button>
          <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerExportImpayes()}>
            Télécharger la liste des impayés
          </Button>
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 5 }}>
        <StatCard label="Élèves" value={String(data.totalEleves)} />
        <StatCard label="Personnel" value={String(data.totalPersonnel)} />
        <StatCard
          label="Frais d'inscription"
          value={`${data.fraisInscription.encaisse.toLocaleString('fr-FR')} GNF`}
          color="green"
        />
        <StatCard
          label="Impayés"
          value={`${data.impayes.montant.toLocaleString('fr-FR')} GNF`}
          color={data.impayes.montant > 0 ? 'red' : 'green'}
        />
        <StatCard label="Absences aujourd'hui" value={String(data.absencesAujourdhui.absents)} color="orange" />
      </SimpleGrid>

      <Paper withBorder p="md" h={300}>
        <Title order={4} mb="sm">
          Présence du jour
        </Title>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={absencesChartData}>
            <XAxis dataKey="nom" />
            <YAxis allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="valeur" fill="#228be6" />
          </BarChart>
        </ResponsiveContainer>
      </Paper>
    </Stack>
  );
}
