import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Table, Title, Group, Anchor, Button, TextInput, Text } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { fetchPersonnel } from '../../api/personnel';
import { correspond } from '../../lib/search';

export function PersonnelListPage() {
  const { data: personnel, isLoading } = useQuery({ queryKey: ['personnel'], queryFn: fetchPersonnel });
  const [recherche, setRecherche] = useState('');

  const personnelFiltre = useMemo(
    () => (personnel ?? []).filter((p) => correspond([p.nom, p.prenom, p.fonction], recherche)),
    [personnel, recherche],
  );

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Personnel</Title>
        <Button component={Link} to="/personnel/nouveau">
          Nouveau membre du personnel
        </Button>
      </Group>

      <TextInput
        placeholder="Rechercher par nom ou fonction..."
        leftSection={<IconSearch size={16} stroke={1.5} />}
        value={recherche}
        onChange={(e) => setRecherche(e.currentTarget.value)}
        mb="md"
        maw={420}
      />

      {isLoading && <p>Chargement...</p>}

      {personnel && personnel.length === 0 && <Text c="dimmed">Aucun membre du personnel enregistré.</Text>}

      {personnel && personnel.length > 0 && personnelFiltre.length === 0 && (
        <Text c="dimmed">Personne ne correspond à « {recherche} ».</Text>
      )}

      {personnel && personnelFiltre.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Nom</Table.Th>
              <Table.Th>Prénom</Table.Th>
              <Table.Th>Fonction</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {personnelFiltre.map((p) => (
              <Table.Tr key={p.id}>
                <Table.Td>{p.nom}</Table.Td>
                <Table.Td>{p.prenom}</Table.Td>
                <Table.Td>{p.fonction}</Table.Td>
                <Table.Td>
                  <Anchor component={Link} to={`/personnel/${p.id}`}>
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
