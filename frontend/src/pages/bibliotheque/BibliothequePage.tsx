import { useMemo, useState } from 'react';
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
  Text,
  SimpleGrid,
  Paper,
  Anchor,
  SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconSearch } from '@tabler/icons-react';
import { confirmerSuppression } from '../../lib/confirm';
import { correspond } from '../../lib/search';
import {
  fetchResumeBibliotheque,
  fetchLivres,
  createLivre,
  updateLivre,
  deleteLivre,
  fetchEmprunts,
  emprunterLivre,
  retournerEmprunt,
  type Livre,
  type StatutEmprunt,
} from '../../api/bibliotheque';
import { fetchEleves } from '../../api/eleves';

export function BibliothequePage() {
  const queryClient = useQueryClient();

  const { data: resume } = useQuery({ queryKey: ['bibliotheque-resume'], queryFn: fetchResumeBibliotheque });
  const { data: livres, isLoading: chargementLivres } = useQuery({ queryKey: ['bibliotheque-livres'], queryFn: fetchLivres });
  const { data: eleves } = useQuery({ queryKey: ['eleves'], queryFn: fetchEleves });

  function invalider() {
    queryClient.invalidateQueries({ queryKey: ['bibliotheque-resume'] });
    queryClient.invalidateQueries({ queryKey: ['bibliotheque-livres'] });
    queryClient.invalidateQueries({ queryKey: ['bibliotheque-emprunts'] });
  }

  // ── Catalogue ──

  const [rechercheLivre, setRechercheLivre] = useState('');
  const livresFiltres = useMemo(
    () => (livres ?? []).filter((l) => correspond([l.titre, l.auteur, l.categorie], rechercheLivre)),
    [livres, rechercheLivre],
  );

  const [modalLivreOuvert, setModalLivreOuvert] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [titre, setTitre] = useState('');
  const [auteur, setAuteur] = useState('');
  const [isbn, setIsbn] = useState('');
  const [categorie, setCategorie] = useState('');
  const [quantiteTotale, setQuantiteTotale] = useState<number | ''>(1);

  function ouvrirCreationLivre() {
    setEditId(null);
    setTitre('');
    setAuteur('');
    setIsbn('');
    setCategorie('');
    setQuantiteTotale(1);
    setModalLivreOuvert(true);
  }

  function ouvrirEditionLivre(l: Livre) {
    setEditId(l.id);
    setTitre(l.titre);
    setAuteur(l.auteur ?? '');
    setIsbn(l.isbn ?? '');
    setCategorie(l.categorie ?? '');
    setQuantiteTotale(l.quantiteTotale);
    setModalLivreOuvert(true);
  }

  const saveLivreMutation = useMutation({
    mutationFn: () => {
      const payload = {
        titre,
        auteur: auteur || undefined,
        isbn: isbn || undefined,
        categorie: categorie || undefined,
        quantiteTotale: Number(quantiteTotale),
      };
      return editId ? updateLivre(editId, payload) : createLivre(payload);
    },
    onSuccess: () => {
      invalider();
      notifications.show({ message: editId ? 'Livre mis à jour' : 'Livre ajouté', color: 'green' });
      setModalLivreOuvert(false);
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const deleteLivreMutation = useMutation({
    mutationFn: (id: string) => deleteLivre(id),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Livre supprimé', color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors de la suppression', color: 'red' }),
  });

  // ── Emprunts ──

  const [filtreEmprunt, setFiltreEmprunt] = useState<StatutEmprunt | 'TOUS'>('EN_COURS');
  const { data: emprunts, isLoading: chargementEmprunts } = useQuery({
    queryKey: ['bibliotheque-emprunts', filtreEmprunt],
    queryFn: () => fetchEmprunts(filtreEmprunt === 'TOUS' ? undefined : filtreEmprunt),
  });

  const [modalEmpruntOuvert, setModalEmpruntOuvert] = useState(false);
  const [livreId, setLivreId] = useState<string | null>(null);
  const [eleveId, setEleveId] = useState<string | null>(null);
  const [dateRetourPrevue, setDateRetourPrevue] = useState('');

  function ouvrirNouvelEmprunt() {
    setLivreId(null);
    setEleveId(null);
    setDateRetourPrevue('');
    setModalEmpruntOuvert(true);
  }

  const emprunterMutation = useMutation({
    mutationFn: () =>
      emprunterLivre({
        livreId: livreId!,
        eleveId: eleveId!,
        dateRetourPrevue: dateRetourPrevue || undefined,
      }),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Emprunt enregistré', color: 'green' });
      setModalEmpruntOuvert(false);
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const retournerMutation = useMutation({
    mutationFn: (id: string) => retournerEmprunt(id),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Retour enregistré', color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const livresDisponibles = (livres ?? []).filter((l) => l.quantiteDisponible > 0);

  return (
    <Stack>
      <Title order={2}>Bibliothèque</Title>

      {resume && (
        <SimpleGrid cols={{ base: 2, md: 4 }}>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">Titres au catalogue</Text>
            <Text fw={700} size="xl">{resume.nbTitres}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">Exemplaires au total</Text>
            <Text fw={700} size="xl">{resume.totalExemplaires}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">Emprunts en cours</Text>
            <Text fw={700} size="xl">{resume.empruntsEnCours}</Text>
          </Paper>
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">En retard</Text>
            <Text fw={700} size="xl" c={resume.enRetard > 0 ? 'red' : undefined}>{resume.enRetard}</Text>
          </Paper>
        </SimpleGrid>
      )}

      {/* Catalogue */}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Catalogue</Title>
          <Button onClick={ouvrirCreationLivre}>Nouveau livre</Button>
        </Group>

        <TextInput
          placeholder="Rechercher un livre par titre, auteur ou catégorie..."
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={rechercheLivre}
          onChange={(e) => setRechercheLivre(e.currentTarget.value)}
          mb="sm"
          maw={420}
        />

        {chargementLivres && <Text>Chargement...</Text>}

        {livres && livres.length === 0 && <Text c="dimmed">Aucun livre au catalogue.</Text>}

        {livres && livres.length > 0 && livresFiltres.length === 0 && (
          <Text c="dimmed">Aucun livre ne correspond à « {rechercheLivre} ».</Text>
        )}

        {livresFiltres.length > 0 && (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Titre</Table.Th>
                <Table.Th>Auteur</Table.Th>
                <Table.Th>Catégorie</Table.Th>
                <Table.Th>Disponibles</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {livresFiltres.map((l) => (
                <Table.Tr key={l.id}>
                  <Table.Td>{l.titre}</Table.Td>
                  <Table.Td>{l.auteur ?? '—'}</Table.Td>
                  <Table.Td>{l.categorie ?? '—'}</Table.Td>
                  <Table.Td>
                    <Badge color={l.quantiteDisponible > 0 ? 'green' : 'red'}>
                      {l.quantiteDisponible} / {l.quantiteTotale}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Anchor component="button" type="button" onClick={() => ouvrirEditionLivre(l)}>
                        Modifier
                      </Anchor>
                      <Anchor
                        component="button"
                        type="button"
                        c="red"
                        onClick={() =>
                          confirmerSuppression({
                            message: `Voulez-vous vraiment supprimer « ${l.titre} » ? Cette action est définitive.`,
                            onConfirm: () => deleteLivreMutation.mutate(l.id),
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
      </Paper>

      {/* Emprunts */}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Emprunts</Title>
          <Button onClick={ouvrirNouvelEmprunt}>Nouvel emprunt</Button>
        </Group>

        <SegmentedControl
          value={filtreEmprunt}
          onChange={(v) => setFiltreEmprunt(v as StatutEmprunt | 'TOUS')}
          data={[
            { label: 'En cours', value: 'EN_COURS' },
            { label: 'Retournés', value: 'RETOURNE' },
            { label: 'Tous', value: 'TOUS' },
          ]}
          mb="sm"
        />

        {chargementEmprunts && <Text>Chargement...</Text>}
        {emprunts && emprunts.length === 0 && <Text c="dimmed">Aucun emprunt dans cette catégorie.</Text>}

        {emprunts && emprunts.length > 0 && (
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Livre</Table.Th>
                <Table.Th>Élève</Table.Th>
                <Table.Th>Emprunté le</Table.Th>
                <Table.Th>Retour prévu</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {emprunts.map((e) => (
                <Table.Tr key={e.id}>
                  <Table.Td>{e.livre.titre}</Table.Td>
                  <Table.Td>
                    {e.eleve.prenom} {e.eleve.nom}
                  </Table.Td>
                  <Table.Td>{new Date(e.dateEmprunt).toLocaleDateString('fr-FR')}</Table.Td>
                  <Table.Td>{new Date(e.dateRetourPrevue).toLocaleDateString('fr-FR')}</Table.Td>
                  <Table.Td>
                    {e.statut === 'RETOURNE' ? (
                      <Badge color="gray">Retourné</Badge>
                    ) : e.enRetard ? (
                      <Badge color="red">En retard</Badge>
                    ) : (
                      <Badge color="green">En cours</Badge>
                    )}
                  </Table.Td>
                  <Table.Td>
                    {e.statut === 'EN_COURS' && (
                      <Anchor
                        component="button"
                        type="button"
                        onClick={() => retournerMutation.mutate(e.id)}
                      >
                        Marquer retourné
                      </Anchor>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal
        opened={modalLivreOuvert}
        onClose={() => setModalLivreOuvert(false)}
        title={editId ? 'Modifier le livre' : 'Nouveau livre'}
      >
        <Stack>
          <TextInput label="Titre" required value={titre} onChange={(e) => setTitre(e.currentTarget.value)} />
          <TextInput label="Auteur (optionnel)" value={auteur} onChange={(e) => setAuteur(e.currentTarget.value)} />
          <Group grow>
            <TextInput label="ISBN (optionnel)" value={isbn} onChange={(e) => setIsbn(e.currentTarget.value)} />
            <TextInput label="Catégorie (optionnel)" value={categorie} onChange={(e) => setCategorie(e.currentTarget.value)} />
          </Group>
          <NumberInput
            label="Nombre d'exemplaires"
            min={editId ? 0 : 1}
            value={quantiteTotale}
            onChange={(v) => setQuantiteTotale(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!titre || quantiteTotale === ''}
            loading={saveLivreMutation.isPending}
            onClick={() => saveLivreMutation.mutate()}
          >
            {editId ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </Stack>
      </Modal>

      <Modal opened={modalEmpruntOuvert} onClose={() => setModalEmpruntOuvert(false)} title="Nouvel emprunt">
        <Stack>
          <Select
            label="Livre"
            placeholder="Choisir un livre disponible"
            data={livresDisponibles.map((l) => ({ value: l.id, label: `${l.titre} (${l.quantiteDisponible} dispo.)` }))}
            value={livreId}
            onChange={setLivreId}
          />
          <Select
            label="Élève"
            placeholder="Choisir un élève"
            searchable
            data={(eleves ?? []).map((e) => ({ value: e.id, label: `${e.prenom} ${e.nom}` }))}
            value={eleveId}
            onChange={setEleveId}
          />
          <TextInput
            label="Date de retour prévue (optionnel, 14 jours par défaut)"
            type="date"
            value={dateRetourPrevue}
            onChange={(e) => setDateRetourPrevue(e.currentTarget.value)}
          />
          <Button
            disabled={!livreId || !eleveId}
            loading={emprunterMutation.isPending}
            onClick={() => emprunterMutation.mutate()}
          >
            Enregistrer l'emprunt
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
