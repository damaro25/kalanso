import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Table, Title, Button, Group, Badge, Anchor, TextInput, Text, Select } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { fetchEleves } from '../../api/eleves';
import { fetchClasses, fetchClasseEleves } from '../../api/classes';
import { correspond } from '../../lib/search';

export function ElevesListPage() {
  const [recherche, setRecherche] = useState('');
  const [classeId, setClasseId] = useState<string | null>(null);

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const { data: eleves, isLoading } = useQuery({
    queryKey: ['eleves', classeId],
    queryFn: () => (classeId ? fetchClasseEleves(classeId) : fetchEleves()),
  });

  const elevesFiltres = useMemo(
    () =>
      (eleves ?? [])
        .filter((e) => correspond([e.nom, e.prenom, e.matricule], recherche))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [eleves, recherche],
  );

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Élèves</Title>
        <Button component={Link} to="/admissions">
          Nouvel élève (via Admissions)
        </Button>
      </Group>

      <Group mb="md">
        <TextInput
          placeholder="Rechercher un élève par nom ou matricule..."
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
          maw={420}
        />
        <Select
          placeholder="Toutes les classes"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.anneeScolaire.libelle})` }))}
          value={classeId}
          onChange={setClasseId}
          clearable
          w={260}
        />
      </Group>

      {isLoading && <p>Chargement...</p>}

      {eleves && eleves.length === 0 && (
        <Text c="dimmed">{classeId ? 'Aucun élève inscrit dans cette classe.' : 'Aucun élève enregistré.'}</Text>
      )}

      {eleves && eleves.length > 0 && elevesFiltres.length === 0 && (
        <Text c="dimmed">Aucun élève ne correspond à « {recherche} ».</Text>
      )}

      {eleves && elevesFiltres.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Matricule</Table.Th>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Prénom</Table.Th>
              <Table.Th>Genre</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {elevesFiltres.map((eleve) => (
              <Table.Tr key={eleve.id}>
                <Table.Td>{eleve.matricule ?? '—'}</Table.Td>
                <Table.Td>{eleve.nom}</Table.Td>
                <Table.Td>{eleve.prenom}</Table.Td>
                <Table.Td>
                  <Badge color={eleve.genre === 'F' ? 'pink' : 'blue'}>{eleve.genre}</Badge>
                </Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/eleves/${eleve.id}`}>
                    Voir la fiche
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </>
  );
}
