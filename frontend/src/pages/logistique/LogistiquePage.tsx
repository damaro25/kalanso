import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Group,
  Button,
  Table,
  Badge,
  Stack,
  Modal,
  Select,
  TextInput,
  NumberInput,
  Textarea,
  Text,
  SimpleGrid,
  Paper,
  Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { confirmerSuppression } from '../../lib/confirm';
import {
  fetchMateriel,
  fetchResumeInventaire,
  createMateriel,
  updateMateriel,
  deleteMateriel,
  telechargerInventaire,
  CATEGORIES,
  ETATS,
  type Materiel,
  type CategorieMateriel,
  type EtatMateriel,
} from '../../api/logistique';
import { fetchSalles, createSalle } from '../../api/emploiDuTemps';

const ETAT_COLORS: Record<EtatMateriel, string> = {
  BON: 'green',
  MOYEN: 'yellow',
  A_REPARER: 'orange',
  HORS_SERVICE: 'red',
};

const CATEGORIE_LABELS: Record<CategorieMateriel, string> = {
  MOBILIER: 'Mobilier',
  INFORMATIQUE: 'Informatique',
  PEDAGOGIQUE: 'Pédagogique',
  AUTRE: 'Autre',
};
const ETAT_LABELS: Record<EtatMateriel, string> = {
  BON: 'Bon',
  MOYEN: 'Moyen',
  A_REPARER: 'À réparer',
  HORS_SERVICE: 'Hors service',
};

export function LogistiquePage() {
  const queryClient = useQueryClient();
  const [filtreCategorie, setFiltreCategorie] = useState<string | null>(null);
  const [filtreEtat, setFiltreEtat] = useState<string | null>(null);

  const { data: materiels, isLoading } = useQuery({
    queryKey: ['materiel', filtreCategorie, filtreEtat],
    queryFn: () => fetchMateriel({ categorie: filtreCategorie ?? undefined, etat: filtreEtat ?? undefined }),
  });
  const { data: resume } = useQuery({ queryKey: ['inventaire-resume'], queryFn: fetchResumeInventaire });
  const { data: salles } = useQuery({ queryKey: ['salles'], queryFn: fetchSalles });

  const [modalOuvert, setModalOuvert] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [categorie, setCategorie] = useState<string | null>('MOBILIER');
  const [designation, setDesignation] = useState('');
  const [quantite, setQuantite] = useState<number | ''>(1);
  const [etat, setEtat] = useState<string | null>('BON');
  const [salleId, setSalleId] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [nouvelleSalle, setNouvelleSalle] = useState('');

  function ouvrirCreation() {
    setEditId(null);
    setCategorie('MOBILIER');
    setDesignation('');
    setQuantite(1);
    setEtat('BON');
    setSalleId(null);
    setDescription('');
    setModalOuvert(true);
  }

  function ouvrirEdition(m: Materiel) {
    setEditId(m.id);
    setCategorie(m.categorie);
    setDesignation(m.designation);
    setQuantite(m.quantite);
    setEtat(m.etat);
    setSalleId(m.salleId);
    setDescription(m.description ?? '');
    setModalOuvert(true);
  }

  const invalider = () => {
    queryClient.invalidateQueries({ queryKey: ['materiel'] });
    queryClient.invalidateQueries({ queryKey: ['inventaire-resume'] });
  };

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        categorie: categorie as CategorieMateriel,
        designation,
        quantite: Number(quantite),
        etat: etat as EtatMateriel,
        salleId: salleId ?? undefined,
        description: description || undefined,
      };
      return editId ? updateMateriel(editId, payload) : createMateriel(payload);
    },
    onSuccess: () => {
      invalider();
      notifications.show({ message: editId ? 'Matériel mis à jour' : 'Matériel ajouté', color: 'green' });
      setModalOuvert(false);
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMateriel(id),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Matériel supprimé', color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors de la suppression', color: 'red' }),
  });

  const salleMutation = useMutation({
    mutationFn: () => createSalle(nouvelleSalle),
    onSuccess: (salle) => {
      queryClient.invalidateQueries({ queryKey: ['salles'] });
      setSalleId(salle.id);
      setNouvelleSalle('');
      notifications.show({ message: 'Salle créée', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création de la salle', color: 'red' }),
  });

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Logistique — Inventaire du matériel</Title>
        <Group>
          <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerInventaire()}>
            Télécharger l'inventaire
          </Button>
          <Button onClick={ouvrirCreation}>Nouveau matériel</Button>
        </Group>
      </Group>

      {resume && (
        <SimpleGrid cols={3}>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">Références</Text>
            <Text fw={700}>{resume.nombreReferences}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">Total articles</Text>
            <Text fw={700}>{resume.totalArticles}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">À réparer / hors service</Text>
            <Text fw={700} c="orange">
              {(resume.parEtat['A_REPARER'] ?? 0) + (resume.parEtat['HORS_SERVICE'] ?? 0)}
            </Text>
          </Paper>
        </SimpleGrid>
      )}

      <Group>
        <Select
          placeholder="Toutes catégories"
          data={CATEGORIES}
          value={filtreCategorie}
          onChange={setFiltreCategorie}
          clearable
          w={200}
        />
        <Select placeholder="Tous états" data={ETATS} value={filtreEtat} onChange={setFiltreEtat} clearable w={180} />
      </Group>

      {isLoading && <p>Chargement...</p>}
      {materiels && materiels.length === 0 && <Text c="dimmed">Aucun matériel enregistré.</Text>}

      {materiels && materiels.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Catégorie</Table.Th>
              <Table.Th>Désignation</Table.Th>
              <Table.Th>Quantité</Table.Th>
              <Table.Th>État</Table.Th>
              <Table.Th>Salle</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {materiels.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{CATEGORIE_LABELS[m.categorie]}</Table.Td>
                <Table.Td>{m.designation}</Table.Td>
                <Table.Td>{m.quantite}</Table.Td>
                <Table.Td>
                  <Badge color={ETAT_COLORS[m.etat]}>{ETAT_LABELS[m.etat]}</Badge>
                </Table.Td>
                <Table.Td>{m.salle?.nom ?? '—'}</Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Anchor component="button" type="button" onClick={() => ouvrirEdition(m)}>
                      Modifier
                    </Anchor>
                    <Anchor
                      component="button"
                      type="button"
                      c="red"
                      onClick={() =>
                        confirmerSuppression({
                          message: `Voulez-vous vraiment supprimer « ${m.designation} » ? Cette action est définitive.`,
                          onConfirm: () => deleteMutation.mutate(m.id),
                        })
                      }
                    >
                      Supprimer
                    </Anchor>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal
        opened={modalOuvert}
        onClose={() => setModalOuvert(false)}
        title={editId ? 'Modifier le matériel' : 'Nouveau matériel'}
      >
        <Stack>
          <Select label="Catégorie" required data={CATEGORIES} value={categorie} onChange={setCategorie} />
          <TextInput
            label="Désignation"
            required
            placeholder="ex: Table-banc, Chaise, Tableau..."
            value={designation}
            onChange={(e) => setDesignation(e.currentTarget.value)}
          />
          <Group grow>
            <NumberInput label="Quantité" min={0} value={quantite} onChange={(v) => setQuantite(v === '' ? '' : Number(v))} />
            <Select label="État" data={ETATS} value={etat} onChange={setEtat} />
          </Group>
          <Select
            label="Salle (localisation)"
            placeholder="Aucune"
            data={(salles ?? []).map((s) => ({ value: s.id, label: s.nom }))}
            value={salleId}
            onChange={setSalleId}
            clearable
          />
          <Group>
            <TextInput
              placeholder="Nouvelle salle"
              value={nouvelleSalle}
              onChange={(e) => setNouvelleSalle(e.currentTarget.value)}
            />
            <Button variant="light" disabled={!nouvelleSalle} loading={salleMutation.isPending} onClick={() => salleMutation.mutate()}>
              Créer la salle
            </Button>
          </Group>
          <Textarea
            label="Description (optionnel)"
            value={description}
            onChange={(e) => setDescription(e.currentTarget.value)}
          />
          <Button
            disabled={!categorie || !designation || quantite === ''}
            loading={saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {editId ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
