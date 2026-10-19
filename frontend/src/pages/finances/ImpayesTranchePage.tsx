import { Paper, Stack, Text, Title } from '@mantine/core';
import { FormulaireImpayesTranche } from '../dashboard/ImpayesTrancheModal';

// Finances > Impayés par tranche : même téléchargement que le bouton du tableau de bord.
export function ImpayesTranchePage() {
  return (
    <Stack maw={520}>
      <div>
        <Title order={2}>Impayés par tranche et par classe</Title>
        <Text c="dimmed" size="sm">
          Année scolaire en cours
        </Text>
      </div>
      <Paper withBorder p="md">
        <FormulaireImpayesTranche />
      </Paper>
    </Stack>
  );
}
