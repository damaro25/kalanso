import { Anchor, Group, Paper, SimpleGrid, Text, Title } from '@mantine/core';
import { Link } from 'react-router-dom';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { TresorerieMensuelle } from '../../api/finance';
import { libelleCourt } from './mois';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function Chiffre({ label, valeur, color }: { label: string; valeur: number; color?: string }) {
  return (
    <div>
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {fmt(valeur)} GNF
      </Text>
    </div>
  );
}

// Résumé du tableau de trésorerie pour le tableau de bord : totaux de l'année,
// trésorerie actuelle et courbe mensuelle. Le tableau complet est dans « Bilan financier ».
export function TresorerieResume({ data }: { data: TresorerieMensuelle }) {
  const derniere = data.tresorerieFinale[data.tresorerieFinale.length - 1] ?? 0;
  const points = data.mois.map((m, i) => ({
    libelle: libelleCourt(m),
    encaissements: data.encaissements.parMois[i],
    decaissements: data.decaissements.parMois[i],
    tresorerie: data.tresorerieFinale[i],
  }));

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Trésorerie ({data.anneeScolaire.libelle})</Title>
        <Anchor component={Link} to="/finance" size="sm">
          Voir le tableau complet
        </Anchor>
      </Group>

      <SimpleGrid cols={{ base: 2, md: 4 }} mb="md">
        <Chiffre label="Encaissements" valeur={data.encaissements.total} color="green" />
        <Chiffre label="Décaissements" valeur={data.decaissements.total} color="red" />
        <Chiffre label={data.benefice >= 0 ? 'Bénéfice' : 'Déficit'} valeur={data.benefice} color={data.benefice >= 0 ? 'green' : 'red'} />
        <Chiffre label="Trésorerie finale" valeur={derniere} color={derniere >= 0 ? undefined : 'red'} />
      </SimpleGrid>

      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="libelle" />
            <YAxis tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip formatter={(v) => `${fmt(Number(v))} GNF`} />
            <Legend />
            <Bar dataKey="encaissements" fill="#2f9e44" name="Encaissements" />
            <Bar dataKey="decaissements" fill="#e03131" name="Décaissements" />
            <Line type="monotone" dataKey="tresorerie" stroke="#1c7ed6" strokeWidth={2} name="Trésorerie finale" />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </Paper>
  );
}
