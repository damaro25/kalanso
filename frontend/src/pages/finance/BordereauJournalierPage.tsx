import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { fetchBordereauJournalier, telechargerBordereauJournalier, type TypeOperation } from '../../api/finance';
import { ouvrirFacturePdf, ouvrirRecu } from '../../api/finances';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// « 2026-10-08 » -> « 08/10/2026 »
function dateFr(iso: string) {
  return iso.split('-').reverse().join('/');
}

const COULEURS_OPERATION: Record<TypeOperation, string> = {
  Inscription: 'teal',
  Réinscription: 'cyan',
  Écolage: 'blue',
  'Trimestre 1': 'indigo',
  'Trimestre 2': 'indigo',
  'Trimestre 3': 'indigo',
  Autre: 'gray',
};

// Bordereau journalier : les encaissements d'un jour, une ligne par reçu (paiement), filtrables par
// niveau. Chaque ligne donne le N° de reçu, le N° de la facture réglée et le type d'opération
// (inscription, réinscription, écolage, trimestre 1, 2, 3). Export Excel au format de la feuille papier.
export function BordereauJournalierPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);

  // Le champ date laisse taper une année à 5 ou 6 chiffres : on n'interroge le serveur que pour une date plausible.
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= '2100-12-31';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['bordereau-journalier', date, niveauId],
    queryFn: () => fetchBordereauJournalier({ date, niveauId: niveauId ?? undefined }),
    enabled: dateValide,
    placeholderData: keepPreviousData, // pas de clignotement quand on change de filtre
  });

  async function telecharger() {
    setTelechargement(true);
    try {
      await telechargerBordereauJournalier({ date, niveauId: niveauId ?? undefined });
    } catch {
      notifications.show({ message: 'Le téléchargement a échoué', color: 'red' });
    } finally {
      setTelechargement(false);
    }
  }

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>Bordereau journalier</Title>
          <Text c="dimmed" size="sm">
            {data?.ecole.nom ?? 'Encaissements du jour'}
          </Text>
        </div>
        <Group gap="sm" align="flex-end">
          <TextInput
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.currentTarget.value)}
            min="2000-01-01"
            max="2100-12-31"
            error={date && !dateValide ? 'Choisissez une date valide' : undefined}
            w={{ base: '100%', sm: 180 }}
          />
          <Select
            label="Niveau"
            placeholder="Tous les niveaux"
            data={(data?.filtres.niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
            value={niveauId}
            onChange={setNiveauId}
            clearable
            w={{ base: '100%', sm: 200 }}
          />
          <Button
            variant="light"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            loading={telechargement}
            disabled={!dateValide}
            onClick={telecharger}
          >
            Télécharger en Excel
          </Button>
        </Group>
      </Group>

      {isLoading && dateValide && <Text c="dimmed">Chargement...</Text>}
      {isError && dateValide && (
        <Text c="red">
          Impossible de charger le bordereau : {(error as any)?.response?.data?.message ?? 'le serveur ne répond pas'}.
        </Text>
      )}

      {data && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Bordereau du {dateFr(data.date)}</Title>
            <Badge variant="light" size="lg">
              {data.lignes.length} reçu{data.lignes.length > 1 ? 's' : ''}
            </Badge>
          </Group>

          {data.lignes.length === 0 ? (
            <Text c="dimmed">
              Aucun paiement encaissé le {dateFr(data.date)}
              {niveauId ? ' pour ce niveau' : ''}.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={1150}>
              <Table striped withColumnBorders verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>N°</Table.Th>
                    <Table.Th>Classe</Table.Th>
                    <Table.Th>Reçu N°</Table.Th>
                    <Table.Th>Facture N°</Table.Th>
                    <Table.Th>Matricule</Table.Th>
                    <Table.Th>Prénoms & Nom</Table.Th>
                    <Table.Th>Type d'opération</Table.Th>
                    <Table.Th>Jour du versement</Table.Th>
                    <Table.Th ta="right">Frais d'études payés</Table.Th>
                    <Table.Th ta="right">Total payé</Table.Th>
                    <Table.Th>Observation</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.lignes.map((l, i) => (
                    <Table.Tr key={l.numeroRecu}>
                      <Table.Td>{i + 1}</Table.Td>
                      <Table.Td>{l.classe}</Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" ff="monospace">
                            {l.numeroRecu}
                          </Text>
                          <Button size="compact-xs" variant="subtle" aria-label="Voir le reçu" onClick={() => ouvrirRecu(l.numeroRecu)}>
                            <IconEye size={14} stroke={1.5} />
                          </Button>
                        </Group>
                      </Table.Td>
                      <Table.Td>
                        <Group gap={4} wrap="nowrap">
                          <Text size="xs" ff="monospace">
                            {l.numeroFacture}
                          </Text>
                          <Button size="compact-xs" variant="subtle" aria-label="Voir la facture" onClick={() => ouvrirFacturePdf(l.numeroFacture)}>
                            <IconEye size={14} stroke={1.5} />
                          </Button>
                        </Group>
                      </Table.Td>
                      <Table.Td>{l.matricule}</Table.Td>
                      <Table.Td>{l.nomComplet}</Table.Td>
                      <Table.Td>
                        <Badge variant="light" color={COULEURS_OPERATION[l.typeOperation]}>
                          {l.typeOperation}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{dateFr(l.date)}</Table.Td>
                      <Table.Td ta="right">{l.fraisEtudes > 0 ? fmt(l.fraisEtudes) : ''}</Table.Td>
                      <Table.Td ta="right" fw={600}>
                        {fmt(l.totalPaye)}
                      </Table.Td>
                      <Table.Td>{l.observation}</Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr fw={700}>
                    <Table.Td colSpan={8} ta="right">
                      Totaux
                    </Table.Td>
                    <Table.Td ta="right">{fmt(data.totaux.fraisEtudes)}</Table.Td>
                    <Table.Td ta="right">{fmt(data.totaux.totalPaye)} GNF</Table.Td>
                    <Table.Td />
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}
    </Stack>
  );
}
