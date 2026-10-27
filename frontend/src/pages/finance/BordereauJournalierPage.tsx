import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Badge, Button, Group, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { fetchBordereauJournalier, telechargerBordereauJournalier } from '../../api/finance';
import { ouvrirRecu } from '../../api/finances';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// « 2026-10-08 » -> « 08/10/2026 »
function dateFr(iso: string) {
  return iso.split('-').reverse().join('/');
}

// Couleurs de la feuille papier
const BLEU = '#2E75B6';
const BLEU_CLAIR = '#DDEBF7';
const CASE_TOTAL = { border: '1.5px solid #000' };

const COLONNES = [
  'N°', 'Classe', 'Reçu', 'Matricule', 'Prénoms & Nom', 'Frais inscription', 'Type inscription', 'T-shirt',
  'Total frais insc + Ass', 'Jour versement', 'Frais études payés', 'Formations', 'Total payé', 'Observation',
];

// Case vide pour un montant nul, comme sur la feuille papier
function montant(n: number) {
  return n ? fmt(n) : '';
}

// Bordereau journalier : les encaissements d'un jour, une ligne par élève (ses versements du jour cumulés),
// filtrables par niveau, présentés comme la feuille papier de l'école (frais d'inscription, assurance,
// frais d'études, formations supplémentaires, total payé, signatures). Export Excel au même format.
export function BordereauJournalierPage() {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [telechargement, setTelechargement] = useState(false);

  // Le champ date laisse taper une année à 5 ou 6 chiffres : on n'interroge le serveur que pour une date plausible.
  const dateValide = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= '2100-12-31';

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['bordereau-journalier', 'feuille-papier-formations', date, niveauId], // 'feuille-papier' : écarte l'ancien format resté en cache hors ligne
    queryFn: () => fetchBordereauJournalier({ date, niveauId: niveauId ?? undefined }),
    enabled: dateValide,
    placeholderData: keepPreviousData, // pas de clignotement quand on change de filtre
  });
  const nbRecus = data?.lignes.reduce((n, l) => n + l.numerosRecu.length, 0) ?? 0;

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
          {/* En-tête de la feuille papier : l'école à gauche, la République et le total du jour à droite */}
          <Group justify="space-between" align="flex-start" mb="md" wrap="nowrap">
            <Text fw={700} size="xl" c={BLEU} tt="uppercase">
              {data.ecole.nom}
            </Text>
            <Stack gap={0} align="center">
              <Text fw={700}>RÉPUBLIQUE DE GUINÉE</Text>
              <Text fs="italic" size="sm">
                Travail-Justice-Solidarité
              </Text>
              <Text fw={700} mt={4} px="sm" bg="yellow.4" c="black" style={{ border: '1px solid #000' }}>
                {fmt(data.totaux.totalPaye)}
              </Text>
            </Stack>
          </Group>

          <Group justify="center" gap="sm" mb="sm">
            <Title order={3}>BORDEREAU JOURNALIER</Title>
            <Badge variant="light" size="lg">
              {data.lignes.length} élève{data.lignes.length > 1 ? 's' : ''} · {nbRecus} reçu{nbRecus > 1 ? 's' : ''}
            </Badge>
          </Group>

          {data.lignes.length === 0 ? (
            <Text c="dimmed" ta="center">
              Aucun paiement encaissé le {dateFr(data.date)}
              {niveauId ? ' pour ce niveau' : ''}.
            </Text>
          ) : (
            <Table.ScrollContainer minWidth={1250}>
              <Table withColumnBorders withTableBorder verticalSpacing={4} fz="sm">
                <Table.Thead>
                  <Table.Tr>
                    {COLONNES.map((c) => (
                      <Table.Th key={c} bg={BLEU} c="white" ta="center" style={{ verticalAlign: 'middle' }}>
                        {c}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.lignes.map((l, i) => (
                    <Table.Tr key={l.eleveId} bg={i % 2 === 1 ? BLEU_CLAIR : undefined}>
                      <Table.Td ta="center" fw={700}>
                        {i + 1}
                      </Table.Td>
                      <Table.Td ta="center" fw={700}>
                        {l.classe}
                      </Table.Td>
                      <Table.Td>
                        <Stack gap={2}>
                          {l.numerosRecu.map((n, k) => (
                            <Group key={l.paiementIds[k]} gap={4} wrap="nowrap" justify="center">
                              <Text size="xs" ff="monospace">
                                {n}
                              </Text>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                aria-label="Voir le reçu"
                                onClick={() => ouvrirRecu(l.paiementIds[k])}
                              >
                                <IconEye size={14} stroke={1.5} />
                              </Button>
                            </Group>
                          ))}
                        </Stack>
                      </Table.Td>
                      <Table.Td>{l.matricule}</Table.Td>
                      <Table.Td>{l.nomComplet}</Table.Td>
                      <Table.Td ta="right">{montant(l.fraisInscription)}</Table.Td>
                      <Table.Td>{l.typeInscription}</Table.Td>
                      <Table.Td ta="right">{montant(l.assurance)}</Table.Td>
                      <Table.Td ta="right">{montant(l.totalInscriptionAssurance)}</Table.Td>
                      <Table.Td ta="center">{dateFr(l.date)}</Table.Td>
                      <Table.Td ta="right">{montant(l.fraisEtudes)}</Table.Td>
                      <Table.Td ta="right">{montant(l.fraisFormations ?? 0)}</Table.Td>
                      <Table.Td ta="right">{fmt(l.totalPaye)}</Table.Td>
                      <Table.Td>{l.observation}</Table.Td>
                    </Table.Tr>
                  ))}
                  <Table.Tr fw={700}>
                    <Table.Td colSpan={5} ta="right">
                      Totaux
                    </Table.Td>
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.fraisInscription)}
                    </Table.Td>
                    <Table.Td />
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.assurance)}
                    </Table.Td>
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.totalInscriptionAssurance)}
                    </Table.Td>
                    <Table.Td />
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.fraisEtudes)}
                    </Table.Td>
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.fraisFormations ?? 0)}
                    </Table.Td>
                    <Table.Td ta="right" style={CASE_TOTAL}>
                      {fmt(data.totaux.totalPaye)}
                    </Table.Td>
                    <Table.Td />
                  </Table.Tr>
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}

          <Text ta="right" fw={700} fs="italic" mt="md">
            {data.ecole.ville ? `${data.ecole.ville}, le` : 'Le'} {dateFr(data.date)}
          </Text>
          <Group justify="space-between" mt="md" px="xl" align="flex-start">
            <Stack gap={40} align="center">
              <Text fw={700}>Directeur Général</Text>
              <Text>{data.ecole.nomDirecteur ?? ''}</Text>
            </Stack>
            <Stack gap={40} align="center">
              <Text fw={700}>Percepteur-Comptable</Text>
              <Text>{data.ecole.nomComptable ?? ''}</Text>
            </Stack>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
