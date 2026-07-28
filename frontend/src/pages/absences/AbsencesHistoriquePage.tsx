import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Title, Select, Table, Stack } from '@mantine/core';
import { fetchClasses } from '../../api/classes';
import { apiClient } from '../../api/client';

interface StatEleve {
  eleveId: string;
  nom: string;
  prenom: string;
  absences: number;
  retards: number;
}

export function AbsencesHistoriquePage() {
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [classeId, setClasseId] = useState<string | null>(null);

  const { data: stats, isLoading } = useQuery({
    queryKey: ['absences-stats', classeId],
    queryFn: async () => {
      const { data } = await apiClient.get<StatEleve[]>('/absences/stats', { params: { classeId } });
      return data;
    },
    enabled: !!classeId,
  });

  return (
    <Stack>
      <Title order={2}>Historique d'absences</Title>

      <Select
        placeholder="Choisir une classe"
        data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
        value={classeId}
        onChange={setClasseId}
        w={280}
      />

      {isLoading && <p>Chargement...</p>}

      {classeId && stats && stats.length === 0 && <p>Aucune absence enregistrée pour cette classe.</p>}

      {classeId && stats && stats.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Élève</Table.Th>
              <Table.Th>Absences</Table.Th>
              <Table.Th>Retards</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {stats.map((s) => (
              <Table.Tr key={s.eleveId}>
                <Table.Td>
                  {s.prenom} {s.nom}
                </Table.Td>
                <Table.Td>{s.absences}</Table.Td>
                <Table.Td>{s.retards}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
