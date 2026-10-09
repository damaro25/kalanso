import { useState } from 'react';
import { Button, Group, Paper, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconPlus } from '@tabler/icons-react';
import { telechargerTresorerie, type BlocTresorerie, type TresorerieMensuelle } from '../../api/finance';
import { enteteMois } from './mois';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function couleur(n: number) {
  return n < 0 ? 'red' : undefined;
}

const premiereColonne = { position: 'sticky', left: 0, background: 'var(--mantine-color-body)', zIndex: 1 } as const;

function Section({ titre, bloc, couleurTitre }: { titre: string; bloc: BlocTresorerie; couleurTitre: string }) {
  return (
    <>
      <Table.Tr>
        <Table.Th colSpan={bloc.parMois.length + 2} c={couleurTitre} style={{ background: 'var(--mantine-color-gray-light)' }}>
          {titre}
        </Table.Th>
      </Table.Tr>
      {bloc.lignes.length === 0 && (
        <Table.Tr>
          <Table.Td colSpan={bloc.parMois.length + 2}>
            <Text size="sm" c="dimmed">
              Aucune opération.
            </Text>
          </Table.Td>
        </Table.Tr>
      )}
      {bloc.lignes.map((l) => (
        <Table.Tr key={`${l.origine}-${l.libelle}`}>
          <Table.Td style={premiereColonne}>{l.libelle}</Table.Td>
          {l.parMois.map((v, i) => (
            <Table.Td key={i} ta="right" c={v === 0 ? 'dimmed' : undefined}>
              {fmt(v)}
            </Table.Td>
          ))}
          <Table.Td ta="right" fw={600}>
            {fmt(l.total)}
          </Table.Td>
        </Table.Tr>
      ))}
      <Table.Tr fw={700}>
        <Table.Td style={premiereColonne}>Total {titre.toLowerCase()}</Table.Td>
        {bloc.parMois.map((v, i) => (
          <Table.Td key={i} ta="right">
            {fmt(v)}
          </Table.Td>
        ))}
        <Table.Td ta="right">{fmt(bloc.total)}</Table.Td>
      </Table.Tr>
    </>
  );
}

export function TresorerieTable({ data, onAjouterDepense }: { data: TresorerieMensuelle; onAjouterDepense?: () => void }) {
  const derniere = data.tresorerieFinale[data.tresorerieFinale.length - 1] ?? 0;
  const [telechargement, setTelechargement] = useState(false);

  async function telecharger() {
    setTelechargement(true);
    try {
      await telechargerTresorerie(data.anneeScolaire.id, data.anneeScolaire.libelle);
    } catch {
      notifications.show({ message: 'Le téléchargement a échoué', color: 'red' });
    } finally {
      setTelechargement(false);
    }
  }

  return (
    <Paper withBorder p="md">
      <Group justify="space-between">
        <Title order={4}>Trésorerie mensuelle ({data.anneeScolaire.libelle})</Title>
        <Group gap="xs">
          {onAjouterDepense && (
            <Button size="xs" color="red" variant="light" leftSection={<IconPlus size={14} stroke={1.5} />} onClick={onAjouterDepense}>
              Ajouter une dépense
            </Button>
          )}
          <Button
            size="xs"
            variant="light"
            leftSection={<IconDownload size={14} stroke={1.5} />}
            loading={telechargement}
            onClick={telecharger}
          >
            Télécharger en Excel
          </Button>
        </Group>
      </Group>
      <Text size="xs" c="dimmed" mb="sm">
        Encaissements et décaissements réels. FT = E − D · Ti = trésorerie finale du mois précédent (0 le premier mois) · Tf = FT + Ti
      </Text>

      <Table.ScrollContainer minWidth={1100}>
        <Table striped={false} withColumnBorders verticalSpacing={4} style={{ whiteSpace: 'nowrap' }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={premiereColonne}>Poste</Table.Th>
              {data.mois.map((m) => (
                <Table.Th key={m.hors ?? `${m.annee}-${m.mois}`} ta="right">
                  {enteteMois(m)}
                </Table.Th>
              ))}
              <Table.Th ta="right">Total</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            <Section titre="Encaissements" bloc={data.encaissements} couleurTitre="green" />
            <Section titre="Décaissements" bloc={data.decaissements} couleurTitre="red" />

            <Table.Tr fw={700}>
              <Table.Td style={premiereColonne}>Flux de trésorerie (E − D)</Table.Td>
              {data.flux.map((v, i) => (
                <Table.Td key={i} ta="right" c={couleur(v)}>
                  {fmt(v)}
                </Table.Td>
              ))}
              <Table.Td ta="right" c={couleur(data.benefice)}>
                {fmt(data.benefice)}
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td style={premiereColonne}>Trésorerie initiale</Table.Td>
              {data.tresorerieInitiale.map((v, i) => (
                <Table.Td key={i} ta="right" c={couleur(v)}>
                  {fmt(v)}
                </Table.Td>
              ))}
              <Table.Td />
            </Table.Tr>
            <Table.Tr fw={700}>
              <Table.Td style={premiereColonne}>Trésorerie finale</Table.Td>
              {data.tresorerieFinale.map((v, i) => (
                <Table.Td key={i} ta="right" c={couleur(v)}>
                  {fmt(v)}
                </Table.Td>
              ))}
              <Table.Td ta="right" c={couleur(derniere)}>
                {fmt(derniere)}
              </Table.Td>
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      <Text mt="sm" fw={700} c={data.benefice >= 0 ? 'green' : 'red'}>
        {data.benefice >= 0 ? 'Bénéfice' : 'Déficit'} sur l'année : {fmt(data.benefice)} GNF
      </Text>
    </Paper>
  );
}
