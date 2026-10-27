import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Badge,
  Button,
  Group,
  Modal,
  MultiSelect,
  NumberInput,
  Paper,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil, IconPlus } from '@tabler/icons-react';
import { REGIMES, libelleRegime, type Regime } from '../../api/finances';
import {
  ajouterFormationsHabituelles,
  creerFormation,
  fetchFormations,
  modifierFormation,
  supprimerFormation,
  type FormationSupplementaire,
} from '../../api/formations';

function erreur(e: unknown, defaut: string) {
  notifications.show({ message: (e as any)?.response?.data?.message ?? defaut, color: 'red' });
}

// Catalogue des formations supplémentaires (arabe, anglais, informatique...) : tarif mensuel et régimes pour
// lesquels elles sont gratuites. Une formation déjà suivie ne se supprime pas : on la désactive.
export function FormationsSupplementaires({ modifiable }: { modifiable: boolean }) {
  const queryClient = useQueryClient();
  const { data: formations } = useQuery({ queryKey: ['formations'], queryFn: fetchFormations });
  const [edition, setEdition] = useState<FormationSupplementaire | 'nouvelle' | null>(null);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['formations'] });

  const habituelles = useMutation({
    mutationFn: ajouterFormationsHabituelles,
    onSuccess: (r) => {
      notifications.show({
        message: r.ajoutees.length ? `Formations ajoutées : ${r.ajoutees.join(', ')}` : 'Les formations habituelles existent déjà',
        color: 'green',
      });
      rafraichir();
    },
    onError: (e) => erreur(e, "Erreur lors de l'ajout"),
  });

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Formations supplémentaires</Title>
        {modifiable && (
          <Group gap="sm">
            <Button variant="light" loading={habituelles.isPending} onClick={() => habituelles.mutate()}>
              Ajouter les formations habituelles
            </Button>
            <Button leftSection={<IconPlus size={16} />} onClick={() => setEdition('nouvelle')}>
              Nouvelle formation
            </Button>
          </Group>
        )}
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        Arabe, anglais, informatique... payées au mois. On y inscrit un élève depuis sa fiche ; la facture du mois se crée
        avec « Facturer le mois » (fiche élève ou page Factures).
      </Text>
      {formations && formations.length === 0 && <Text c="dimmed">Aucune formation pour le moment.</Text>}
      {formations && formations.length > 0 && (
        <Table.ScrollContainer minWidth={600}>
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Formation</Table.Th>
                <Table.Th ta="right">Tarif mensuel</Table.Th>
                <Table.Th>Gratuite pour</Table.Th>
                <Table.Th ta="center">Élèves inscrits</Table.Th>
                <Table.Th>État</Table.Th>
                {modifiable && <Table.Th />}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {formations.map((f) => (
                <Table.Tr key={f.id}>
                  <Table.Td fw={600}>{f.nom}</Table.Td>
                  <Table.Td ta="right">{f.tarifMensuel ? `${f.tarifMensuel.toLocaleString('fr-FR')} GNF` : 'À saisir'}</Table.Td>
                  <Table.Td>{f.regimesGratuits.length ? f.regimesGratuits.map((r) => libelleRegime(r)).join(', ') : '—'}</Table.Td>
                  <Table.Td ta="center">{f._count?.inscriptions ?? 0}</Table.Td>
                  <Table.Td>
                    <Badge color={f.actif ? 'green' : 'gray'} variant="light">
                      {f.actif ? 'Active' : 'Désactivée'}
                    </Badge>
                  </Table.Td>
                  {modifiable && (
                    <Table.Td>
                      <Button size="xs" variant="subtle" leftSection={<IconPencil size={14} />} onClick={() => setEdition(f)}>
                        Modifier
                      </Button>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
      {edition && (
        <ModalFormation formation={edition === 'nouvelle' ? null : edition} onClose={() => setEdition(null)} onSucces={rafraichir} />
      )}
    </Paper>
  );
}

function ModalFormation({
  formation,
  onClose,
  onSucces,
}: {
  formation: FormationSupplementaire | null;
  onClose: () => void;
  onSucces: () => void;
}) {
  const [nom, setNom] = useState(formation?.nom ?? '');
  const [tarif, setTarif] = useState<number>(formation?.tarifMensuel ?? 0);
  const [gratuits, setGratuits] = useState<Regime[]>(formation?.regimesGratuits ?? []);
  const [actif, setActif] = useState(formation?.actif ?? true);

  const terminer = (message: string) => {
    notifications.show({ message, color: 'green' });
    onSucces();
    onClose();
  };
  const enregistrer = useMutation({
    mutationFn: () => {
      const input = { nom, tarifMensuel: tarif, regimesGratuits: gratuits, actif };
      return formation ? modifierFormation(formation.id, input) : creerFormation(input);
    },
    onSuccess: () => terminer(formation ? 'Formation modifiée' : 'Formation ajoutée'),
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement"),
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerFormation(formation!.id),
    onSuccess: () => terminer('Formation supprimée'),
    onError: (e) => erreur(e, 'Erreur lors de la suppression'),
  });

  return (
    <Modal opened onClose={onClose} title={formation ? `Modifier « ${formation.nom} »` : 'Nouvelle formation'}>
      <Stack>
        <TextInput label="Nom" placeholder="Arabe, Anglais, Informatique..." value={nom} onChange={(e) => setNom(e.currentTarget.value)} required />
        <NumberInput
          label="Tarif mensuel (GNF)"
          value={tarif}
          min={0}
          allowDecimal={false}
          allowNegative={false}
          thousandSeparator=" "
          onChange={(v) => setTarif(typeof v === 'number' ? v : 0)}
        />
        <MultiSelect
          label="Gratuite pour les régimes"
          placeholder="Aucun"
          data={REGIMES}
          value={gratuits}
          onChange={(v) => setGratuits(v as Regime[])}
          clearable
        />
        {formation && (
          <Switch label="Formation active (proposée aux élèves)" checked={actif} onChange={(e) => setActif(e.currentTarget.checked)} />
        )}
        <Group justify="space-between">
          {formation ? (
            <Button color="red" variant="subtle" loading={supprimer.isPending} onClick={() => supprimer.mutate()}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <Button disabled={!nom.trim()} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
