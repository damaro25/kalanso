import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Select, Table, Button, Group, SegmentedControl, Stack } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { fetchClasses, fetchClasseEleves } from '../../api/classes';
import { fetchAbsences, enregistrerAppel, telechargerAppelXlsx, type StatutAbsence } from '../../api/absences';

const AUJOURD_HUI = new Date().toISOString().slice(0, 10);

export function AppelDuJourPage() {
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [classeId, setClasseId] = useState<string | null>(null);
  const [statuts, setStatuts] = useState<Record<string, StatutAbsence>>({});

  const { data: eleves } = useQuery({
    queryKey: ['classe-eleves', classeId],
    queryFn: () => fetchClasseEleves(classeId!),
    enabled: !!classeId,
  });

  const { data: appelExistant } = useQuery({
    queryKey: ['absences', classeId, AUJOURD_HUI],
    queryFn: () => fetchAbsences(classeId!, AUJOURD_HUI),
    enabled: !!classeId,
  });

  useEffect(() => {
    if (appelExistant) {
      const initial: Record<string, StatutAbsence> = {};
      for (const a of appelExistant) initial[a.eleveId] = a.statut;
      setStatuts(initial);
    }
  }, [appelExistant]);

  const mutation = useMutation({
    mutationFn: () =>
      enregistrerAppel(
        classeId!,
        AUJOURD_HUI,
        (eleves ?? []).map((e: any) => ({ eleveId: e.id, statut: statuts[e.id] ?? 'PRESENT' })),
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['absences', classeId, AUJOURD_HUI] });
      notifications.show({ message: 'Appel enregistré', color: 'green' });
    },
    onError: () => notifications.show({ message: "Erreur lors de l'enregistrement de l'appel", color: 'red' }),
  });

  return (
    <Stack>
      <Title order={2}>Appel du jour ({AUJOURD_HUI})</Title>

      <Group>
        <Select
          placeholder="Choisir une classe"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          w={280}
        />
        {classeId && (
          <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerAppelXlsx(classeId, AUJOURD_HUI)}>
            Télécharger la liste de présence
          </Button>
        )}
      </Group>

      {classeId && eleves && (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élève</Table.Th>
                <Table.Th>Statut</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {eleves.map((e: any) => (
                <Table.Tr key={e.id}>
                  <Table.Td>
                    {e.prenom} {e.nom}
                  </Table.Td>
                  <Table.Td>
                    <SegmentedControl
                      value={statuts[e.id] ?? 'PRESENT'}
                      onChange={(value) => setStatuts((prev) => ({ ...prev, [e.id]: value as StatutAbsence }))}
                      data={[
                        { label: 'Présent', value: 'PRESENT' },
                        { label: 'Absent', value: 'ABSENT' },
                        { label: 'Retard', value: 'RETARD' },
                      ]}
                    />
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group>
            <Button loading={mutation.isPending} onClick={() => mutation.mutate()}>
              Enregistrer l'appel
            </Button>
          </Group>
        </>
      )}
    </Stack>
  );
}
