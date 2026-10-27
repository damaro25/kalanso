import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Group, Paper, Progress, SegmentedControl, Select, Stack, Table, Text, Title } from '@mantine/core';
import { fetchAnneesScolaires, fetchClasses, libelleAnnee } from '../../api/classes';
import { fetchPaiementsParTranche } from '../../api/finance';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function couleurTaux(taux: number) {
  return taux >= 80 ? 'green' : taux >= 50 ? 'yellow' : 'red';
}

function Taux({ taux }: { taux: number }) {
  return (
    <Group gap={6} wrap="nowrap">
      <Progress value={taux} color={couleurTaux(taux)} w={80} />
      <Text size="sm" fw={600}>
        {taux} %
      </Text>
    </Group>
  );
}

// Paiements par tranche (inscription, tranches 1 à 3) et par genre, pour un régime ou pour tous, avec un
// récapitulatif croisé des régimes. Écolage et inscription seulement (ni formations ni assurance).
export function PaiementsParTranche() {
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const [anneeId, setAnneeId] = useState<string | null>(null);
  const [regime, setRegime] = useState('TOUS');
  const [classeId, setClasseId] = useState<string | null>(null);
  const { data: toutesClasses } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });

  const { data } = useQuery({
    queryKey: ['finance-paiements-par-tranche', anneeId, classeId],
    queryFn: () => fetchPaiementsParTranche({ anneeScolaireId: anneeId ?? undefined, classeId: classeId ?? undefined }),
    placeholderData: keepPreviousData,
  });
  if (!data) return null;

  // Classes de l'année affichée
  const anneeAffichee = anneeId ?? data.anneeScolaire.id;
  const classes = (toutesClasses ?? [])
    .filter((c) => c.anneeScolaire?.id === anneeAffichee)
    .sort((a, b) => a.niveau.ordre - b.niveau.ordre || a.nom.localeCompare(b.nom));

  const choisi = data.regimes.find((r) => r.regime === regime) ?? data.regimes[0];
  const tranchesRecap = data.regimes[0].tranches; // mêmes tranches pour tous les régimes (hors « Écolage (autre) »)

  return (
    <Paper withBorder p="md">
      <Stack gap="sm">
        <Group justify="space-between" align="flex-end">
          <div>
            <Title order={4}>Paiements par tranche et par genre</Title>
            <Text size="sm" c="dimmed">
              Écolage et inscription des élèves inscrits, année {data.anneeScolaire.libelle}
            </Text>
          </div>
          <Group gap="sm" align="flex-end">
            <Select
              label="Année"
              data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
              value={anneeAffichee}
              onChange={(v) => {
                if (!v) return;
                setAnneeId(v);
                // une classe d'une autre année n'a plus de sens
                if (classeId && !(toutesClasses ?? []).some((c) => c.id === classeId && c.anneeScolaire?.id === v)) setClasseId(null);
              }}
              w={{ base: '100%', sm: 160 }}
            />
            <Select
              label="Classe"
              placeholder="Toutes les classes"
              data={classes.map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
              value={classeId}
              onChange={setClasseId}
              clearable
              searchable
              w={{ base: '100%', sm: 220 }}
            />
          </Group>
        </Group>

        <SegmentedControl
          value={regime}
          onChange={setRegime}
          data={data.regimes.map((r) => ({ value: r.regime, label: r.libelle }))}
          fullWidth
        />

        <Table.ScrollContainer minWidth={720}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Tranche</Table.Th>
                <Table.Th ta="right">Attendu</Table.Th>
                <Table.Th ta="right">Payé</Table.Th>
                <Table.Th ta="right">Reste</Table.Th>
                <Table.Th>Taux</Table.Th>
                <Table.Th ta="center">Soldés</Table.Th>
                <Table.Th ta="center">Non soldés</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {choisi.tranches.map((t) => (
                <Table.Tr key={t.cle}>
                  <Table.Td fw={600}>{t.libelle}</Table.Td>
                  <Table.Td ta="right">{fmt(t.attendu)} GNF</Table.Td>
                  <Table.Td ta="right" c="green">
                    {fmt(t.paye)} GNF
                  </Table.Td>
                  <Table.Td ta="right" c={t.reste > 0 ? 'red' : undefined}>
                    {fmt(t.reste)} GNF
                  </Table.Td>
                  <Table.Td>
                    <Taux taux={t.taux} />
                  </Table.Td>
                  <Table.Td ta="center">{t.soldes}</Table.Td>
                  <Table.Td ta="center" c={t.nonSoldes > 0 ? 'red' : undefined}>
                    {t.nonSoldes}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Table.ScrollContainer minWidth={620}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Genre</Table.Th>
                <Table.Th ta="center">Effectif</Table.Th>
                <Table.Th ta="right">Attendu</Table.Th>
                <Table.Th ta="right">Payé</Table.Th>
                <Table.Th ta="right">Reste</Table.Th>
                <Table.Th>Taux</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {choisi.genres.map((g) => (
                <Table.Tr key={g.genre} fw={g.genre === 'TOTAL' ? 700 : undefined}>
                  <Table.Td>{g.libelle}</Table.Td>
                  <Table.Td ta="center">{g.effectif}</Table.Td>
                  <Table.Td ta="right">{fmt(g.attendu)} GNF</Table.Td>
                  <Table.Td ta="right" c="green">
                    {fmt(g.paye)} GNF
                  </Table.Td>
                  <Table.Td ta="right" c={g.reste > 0 ? 'red' : undefined}>
                    {fmt(g.reste)} GNF
                  </Table.Td>
                  <Table.Td>
                    <Taux taux={g.taux} />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>

        <Title order={5} mt="xs">
          Récapitulatif par régime
        </Title>
        <Table.ScrollContainer minWidth={760}>
          <Table withTableBorder withColumnBorders fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Régime</Table.Th>
                {tranchesRecap.map((t) => (
                  <Table.Th key={t.cle} ta="center">
                    {t.libelle}
                  </Table.Th>
                ))}
                <Table.Th ta="right">Payé garçons</Table.Th>
                <Table.Th ta="right">Payé filles</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {data.regimes.map((r) => (
                <Table.Tr key={r.regime} fw={r.regime === 'TOUS' ? 700 : undefined}>
                  <Table.Td>{r.libelle}</Table.Td>
                  {tranchesRecap.map((t) => {
                    const ligne = r.tranches.find((x) => x.cle === t.cle);
                    return (
                      <Table.Td key={t.cle} ta="center" c={ligne && ligne.attendu > 0 ? couleurTaux(ligne.taux) : 'dimmed'}>
                        {ligne && ligne.attendu > 0 ? `${ligne.taux} %` : '—'}
                      </Table.Td>
                    );
                  })}
                  <Table.Td ta="right">{fmt(r.genres.find((g) => g.genre === 'M')?.paye ?? 0)} GNF</Table.Td>
                  <Table.Td ta="right">{fmt(r.genres.find((g) => g.genre === 'F')?.paye ?? 0)} GNF</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Stack>
    </Paper>
  );
}
