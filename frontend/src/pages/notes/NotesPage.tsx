import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Select,
  Table,
  Button,
  Group,
  Paper,
  TextInput,
  NumberInput,
  Stack,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { fetchClasses, fetchClasseEleves } from '../../api/classes';
import {
  fetchMatieres,
  createMatiere,
  fetchNotes,
  saisirNotes,
  telechargerBulletin,
  ouvrirBulletinPdf,
  telechargerNotesClasse,
} from '../../api/notes';

const TRIMESTRES = [
  { value: '1', label: 'Trimestre 1' },
  { value: '2', label: 'Trimestre 2' },
  { value: '3', label: 'Trimestre 3' },
];

export function NotesPage() {
  const queryClient = useQueryClient();
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [classeId, setClasseId] = useState<string | null>(null);
  const [trimestre, setTrimestre] = useState<string | null>('1');
  const [valeurs, setValeurs] = useState<Record<string, number | ''>>({});

  const [matiereNom, setMatiereNom] = useState('');
  const [matiereCoefficient, setMatiereCoefficient] = useState<number | ''>('');

  const classeChoisie = classes?.find((c) => c.id === classeId);
  const niveauId = classeChoisie?.niveau.id;

  const { data: eleves } = useQuery({
    queryKey: ['classe-eleves', classeId],
    queryFn: () => fetchClasseEleves(classeId!),
    enabled: !!classeId,
  });

  const { data: matieres } = useQuery({
    queryKey: ['matieres', niveauId],
    queryFn: () => fetchMatieres(niveauId),
    enabled: !!niveauId,
  });

  const { data: notesExistantes } = useQuery({
    queryKey: ['notes', classeId, trimestre],
    queryFn: () => fetchNotes(classeId!, Number(trimestre)),
    enabled: !!classeId && !!trimestre,
  });

  useEffect(() => {
    if (notesExistantes) {
      const initial: Record<string, number | ''> = {};
      for (const n of notesExistantes) {
        initial[`${n.eleveId}-${n.matiereId}`] = Number(n.valeur);
      }
      setValeurs(initial);
    }
  }, [notesExistantes]);

  const matiereMutation = useMutation({
    mutationFn: () => createMatiere({ niveauId: niveauId!, nom: matiereNom, coefficient: Number(matiereCoefficient) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['matieres', niveauId] });
      notifications.show({ message: 'Matière créée', color: 'green' });
      setMatiereNom('');
      setMatiereCoefficient('');
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création de la matière', color: 'red' }),
  });

  const notesMutation = useMutation({
    mutationFn: () => {
      const entries = Object.entries(valeurs)
        .filter(([, v]) => v !== '')
        .map(([key, valeur]) => {
          const [eleveId, matiereId] = key.split('-');
          return { eleveId, matiereId, valeur: Number(valeur) };
        });
      return saisirNotes(classeId!, Number(trimestre), entries);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes', classeId, trimestre] });
      notifications.show({ message: 'Notes enregistrées', color: 'green' });
    },
    onError: (e: any) =>
      notifications.show({
        message: e?.response?.data?.message ?? "Erreur lors de l'enregistrement des notes",
        color: 'red',
      }),
  });

  return (
    <Stack>
      <Title order={2}>Notes et bulletins</Title>

      <Group>
        <Select
          placeholder="Choisir une classe"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          w={220}
        />
        <Select placeholder="Trimestre" data={TRIMESTRES} value={trimestre} onChange={setTrimestre} w={160} />
        {classeId && (
          <Button
            variant="light"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() => telechargerNotesClasse(classeId, Number(trimestre))}
          >
            Télécharger les notes de la classe
          </Button>
        )}
      </Group>

      {niveauId && (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Nouvelle matière pour ce niveau
          </Title>
          <Group>
            <TextInput placeholder="Nom (ex: Mathématiques)" value={matiereNom} onChange={(e) => setMatiereNom(e.currentTarget.value)} />
            <NumberInput
              placeholder="Coefficient"
              value={matiereCoefficient}
              onChange={(v) => setMatiereCoefficient(v === '' ? '' : Number(v))}
              w={140}
            />
            <Button
              disabled={!matiereNom || !matiereCoefficient}
              loading={matiereMutation.isPending}
              onClick={() => matiereMutation.mutate()}
            >
              Créer
            </Button>
          </Group>
        </Paper>
      )}

      {classeId && eleves && matieres && matieres.length > 0 && (
        <>
          <Table striped withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élève</Table.Th>
                {matieres.map((m) => (
                  <Table.Th key={m.id}>
                    {m.nom} (coef. {Number(m.coefficient)})
                  </Table.Th>
                ))}
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {eleves.map((e: any) => (
                <Table.Tr key={e.id}>
                  <Table.Td>
                    {e.prenom} {e.nom}
                  </Table.Td>
                  {matieres.map((m) => {
                    const key = `${e.id}-${m.id}`;
                    return (
                      <Table.Td key={m.id}>
                        <NumberInput
                          min={0}
                          max={10}
                          clampBehavior="strict"
                          value={valeurs[key] ?? ''}
                          onChange={(v) => setValeurs((prev) => ({ ...prev, [key]: v === '' ? '' : Number(v) }))}
                          w={90}
                        />
                      </Table.Td>
                    );
                  })}
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconDownload size={14} stroke={1.5} />}
                        onClick={() => telechargerBulletin(e.id, Number(trimestre))}
                      >
                        Télécharger le bulletin
                      </Button>
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconEye size={14} stroke={1.5} />}
                        onClick={() => ouvrirBulletinPdf(e.id, Number(trimestre))}
                      >
                        Voir le bulletin
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Group>
            <Button loading={notesMutation.isPending} onClick={() => notesMutation.mutate()}>
              Enregistrer les notes
            </Button>
          </Group>
        </>
      )}

      {classeId && matieres && matieres.length === 0 && (
        <p>Aucune matière définie pour ce niveau. Crée une matière ci-dessus pour commencer à saisir des notes.</p>
      )}
    </Stack>
  );
}
