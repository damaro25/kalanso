import { useQuery } from '@tanstack/react-query';
import { Badge, Group, Paper, Text, Title } from '@mantine/core';
import { STATUTS_ASSURANCE, fetchAssuranceEleve } from '../../api/assurance';

// Statut de l'assurance scolaire de l'élève pour l'année courante (la facture se paie avec les autres factures).
export function AssuranceEleve({ eleveId }: { eleveId: string }) {
  const { data } = useQuery({ queryKey: ['finance-assurance-eleve', eleveId], queryFn: () => fetchAssuranceEleve(eleveId) });
  if (!data) return null;
  const l = data.ligne;
  const s = l ? STATUTS_ASSURANCE.find((x) => x.value === l.statut) : null;
  return (
    <Paper withBorder p="md">
      <Group justify="space-between">
        <Title order={4}>T-shirt {data.anneeScolaire.libelle}</Title>
        {s ? (
          <Badge color={s.couleur} variant="light" size="lg">
            {s.label}
          </Badge>
        ) : (
          <Badge color="gray" variant="light" size="lg">
            {data.montantConfigure ? 'Élève non inscrit cette année' : 'Montant non configuré'}
          </Badge>
        )}
      </Group>
      {l && l.montant > 0 && (
        <Text size="sm" c="dimmed" mt={4}>
          {l.paye.toLocaleString('fr-FR')} payés sur {l.montant.toLocaleString('fr-FR')} GNF
          {l.statut === 'NON_FACTUREE' ? ' (facture pas encore créée)' : ''}
        </Text>
      )}
    </Paper>
  );
}
