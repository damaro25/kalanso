import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Title, Table, Anchor, Badge } from '@mantine/core';
import { fetchClasseEleves } from '../../api/classes';
import type { Eleve } from '../../api/eleves';

export function ClasseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: eleves, isLoading } = useQuery({
    queryKey: ['classe-eleves', id],
    queryFn: () => fetchClasseEleves(id!),
    enabled: !!id,
  });

  return (
    <>
      <Title order={2} mb="md">
        Élèves de la classe
      </Title>

      {isLoading && <p>Chargement...</p>}

      {eleves && eleves.length === 0 && <p>Aucun élève affecté à cette classe pour l'instant.</p>}

      {eleves && eleves.length > 0 && (
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
            {(eleves as Eleve[]).map((eleve) => (
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
