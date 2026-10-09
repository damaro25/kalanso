import { useQuery } from '@tanstack/react-query';
import { Title, SimpleGrid, Paper, Text, Group, Button, Stack, Alert } from '@mantine/core';
import { IconDownload, IconInfoCircle } from '@tabler/icons-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { fetchDashboard, telechargerExportEleves, telechargerExportImpayes } from '../../api/reporting';
import { fetchTresorerieParMois } from '../../api/finance';
import { useAuth } from '../../auth/AuthContext';
import { TresorerieResume } from '../finance/TresorerieResume';
import { StatistiquesPaiements } from './StatistiquesPaiements';

// Mêmes rôles que l'API /finance (voir FinanceController) : les autres n'ont pas accès aux chiffres de trésorerie.
const ROLES_FINANCE = ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'];

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
  const { user } = useAuth();
  const voitTresorerie = !!user && ROLES_FINANCE.includes(user.role);

  const { data, isLoading } = useQuery({ queryKey: ['dashboard'], queryFn: fetchDashboard });
  const { data: tresorerie } = useQuery({
    queryKey: ['dashboard-tresorerie'],
    queryFn: () => fetchTresorerieParMois(),
    enabled: voitTresorerie,
  });

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
          {voitTresorerie && (
            <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerExportImpayes()}>
              Télécharger la liste des impayés
            </Button>
          )}
        </Group>
      </Group>

      {data.perimetre && data.perimetre.nbClasses === 0 && (
        <Alert color="orange" variant="light" icon={<IconInfoCircle size={18} />}>
          Aucune classe ne vous est encore affectée. Rapprochez-vous de la direction : vos classes sont celles de votre emploi du temps,
          plus celles qu'elle vous confie.
        </Alert>
      )}

      <SimpleGrid cols={{ base: 2, md: voitTresorerie ? 5 : data.perimetre ? 3 : 3 }}>
        <StatCard label={data.perimetre ? 'Élèves de mes classes' : 'Élèves'} value={String(data.totalEleves)} />
        {data.perimetre && <StatCard label="Mes classes" value={String(data.perimetre.nbClasses)} />}
        {data.totalPersonnel !== undefined && <StatCard label="Personnel" value={String(data.totalPersonnel)} />}
        {voitTresorerie && data.fraisInscription && (
          <StatCard
            label="Frais d'inscription"
            value={`${data.fraisInscription.encaisse.toLocaleString('fr-FR')} GNF`}
            color="green"
          />
        )}
        {voitTresorerie && data.impayes && (
          <StatCard
            label="Impayés"
            value={`${data.impayes.montant.toLocaleString('fr-FR')} GNF`}
            color={data.impayes.montant > 0 ? 'red' : 'green'}
          />
        )}
        <StatCard label="Absences aujourd'hui" value={String(data.absencesAujourdhui.absents)} color="orange" />
      </SimpleGrid>

      {voitTresorerie && <StatistiquesPaiements />}

      {voitTresorerie && tresorerie && <TresorerieResume data={tresorerie} />}

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
