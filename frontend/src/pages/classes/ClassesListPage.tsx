import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { Table, Title, Group, Anchor, Paper, TextInput, Select, Button, Stack, Text, SimpleGrid, Badge } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchEffectifs, fetchNiveaux, fetchAnneesScolaires, createClasse, createAnneeScolaire, activerAnneeScolaire } from '../../api/classes';
import { correspond } from '../../lib/search';

export function ClassesListPage() {
  const queryClient = useQueryClient();
  const { data: effectifs, isLoading } = useQuery({ queryKey: ['effectifs'], queryFn: fetchEffectifs });
  const { data: niveaux } = useQuery({ queryKey: ['niveaux'], queryFn: fetchNiveaux });
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });

  const [nom, setNom] = useState('');
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState('');

  const effectifsFiltres = useMemo(
    () => (effectifs ?? []).filter((e) => correspond([e.nom, e.niveau, e.anneeScolaire], recherche)),
    [effectifs, recherche],
  );

  const anneeCourante = annees?.find((a) => a.courante) ?? annees?.[0];
  const [anneeSelectionnee, setAnneeSelectionnee] = useState<string | null>(null);
  const anneeClasseId = anneeSelectionnee ?? anneeCourante?.id ?? null;

  const mutation = useMutation({
    mutationFn: createClasse,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      notifications.show({ message: 'Classe créée', color: 'green' });
      setNom('');
      setNiveauId(null);
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création de la classe', color: 'red' }),
  });

  const [libelleAnnee, setLibelleAnnee] = useState('');
  const [dateDebutAnnee, setDateDebutAnnee] = useState('');
  const [dateFinAnnee, setDateFinAnnee] = useState('');

  const anneeMutation = useMutation({
    mutationFn: createAnneeScolaire,
    onSuccess: (annee) => {
      queryClient.invalidateQueries({ queryKey: ['annees-scolaires'] });
      notifications.show({ message: `Année scolaire ${annee.libelle} créée`, color: 'green' });
      setLibelleAnnee('');
      setDateDebutAnnee('');
      setDateFinAnnee('');
      setAnneeSelectionnee(annee.id);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? "Erreur lors de la création de l'année scolaire", color: 'red' }),
  });

  const activerMutation = useMutation({
    mutationFn: activerAnneeScolaire,
    onSuccess: (annee) => {
      queryClient.invalidateQueries({ queryKey: ['annees-scolaires'] });
      notifications.show({ message: `${annee.libelle} est maintenant l'année courante`, color: 'green' });
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? "Erreur lors de l'activation", color: 'red' }),
  });

  return (
    <Stack>
      <Title order={2}>Classes</Title>

      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Nouvelle classe
          </Title>
          <Stack gap="sm">
            <Group>
              <TextInput placeholder="Nom (ex: CM1 A)" value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
              <Select
                placeholder="Niveau"
                data={(niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
                value={niveauId}
                onChange={setNiveauId}
              />
            </Group>
            <Group>
              <Select
                label="Année scolaire"
                data={(annees ?? []).map((a) => ({ value: a.id, label: a.libelle + (a.courante ? ' (courante)' : '') }))}
                value={anneeClasseId}
                onChange={setAnneeSelectionnee}
                w={220}
              />
              <Button
                disabled={!nom || !niveauId || !anneeClasseId}
                loading={mutation.isPending}
                onClick={() =>
                  niveauId &&
                  anneeClasseId &&
                  mutation.mutate({
                    nom,
                    niveauId,
                    anneeScolaireId: anneeClasseId,
                  })
                }
                mt={24}
              >
                Créer la classe
              </Button>
            </Group>
          </Stack>
        </Paper>

        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Nouvelle année scolaire
          </Title>
          <Text size="xs" c="dimmed" mb="sm">
            Nécessaire pour préparer les classes de l'année suivante (ex: pour le passage de classe).
          </Text>
          <Stack gap="sm">
            <TextInput
              placeholder="Libellé (ex: 2026-2027)"
              value={libelleAnnee}
              onChange={(e) => setLibelleAnnee(e.currentTarget.value)}
            />
            <Group>
              <TextInput
                label="Début"
                type="date"
                value={dateDebutAnnee}
                onChange={(e) => setDateDebutAnnee(e.currentTarget.value)}
              />
              <TextInput label="Fin" type="date" value={dateFinAnnee} onChange={(e) => setDateFinAnnee(e.currentTarget.value)} />
            </Group>
            <Button
              disabled={!libelleAnnee || !dateDebutAnnee || !dateFinAnnee}
              loading={anneeMutation.isPending}
              onClick={() => anneeMutation.mutate({ libelle: libelleAnnee, dateDebut: dateDebutAnnee, dateFin: dateFinAnnee })}
            >
              Créer l'année scolaire
            </Button>

            {annees && annees.length > 0 && (
              <Stack gap={6} mt="xs">
                {annees.map((a) => (
                  <Group key={a.id} justify="space-between">
                    <Text size="sm">{a.libelle}</Text>
                    {a.courante ? (
                      <Badge color="kalanso">Courante</Badge>
                    ) : (
                      <Anchor
                        component="button"
                        type="button"
                        size="sm"
                        onClick={() => activerMutation.mutate(a.id)}
                      >
                        Définir comme courante
                      </Anchor>
                    )}
                  </Group>
                ))}
              </Stack>
            )}
          </Stack>
        </Paper>
      </SimpleGrid>

      <TextInput
        placeholder="Rechercher une classe par nom ou niveau..."
        leftSection={<IconSearch size={16} stroke={1.5} />}
        value={recherche}
        onChange={(e) => setRecherche(e.currentTarget.value)}
        maw={420}
      />

      {isLoading && <p>Chargement...</p>}

      {effectifs && effectifs.length === 0 && <Text c="dimmed">Aucune classe créée.</Text>}

      {effectifs && effectifs.length > 0 && effectifsFiltres.length === 0 && (
        <Text c="dimmed">Aucune classe ne correspond à « {recherche} ».</Text>
      )}

      {effectifs && effectifsFiltres.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Classe</Table.Th>
              <Table.Th>Niveau</Table.Th>
              <Table.Th>Année scolaire</Table.Th>
              <Table.Th>Frais d'inscription</Table.Th>
              <Table.Th>Écolage</Table.Th>
              <Table.Th>Filles</Table.Th>
              <Table.Th>Garçons</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {effectifsFiltres.map((e) => (
              <Table.Tr key={e.classeId}>
                <Table.Td>{e.nom}</Table.Td>
                <Table.Td>{e.niveau}</Table.Td>
                <Table.Td>{e.anneeScolaire}</Table.Td>
                <Table.Td>{Number(e.fraisInscription).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>{Number(e.ecolage).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>{e.filles}</Table.Td>
                <Table.Td>{e.garcons}</Table.Td>
                <Table.Td>{e.total}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/classes/${e.classeId}`}>
                    Voir les élèves
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
