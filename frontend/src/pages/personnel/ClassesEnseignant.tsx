import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Anchor, Badge, Button, Group, MultiSelect, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { definirClassesEnseignant, fetchClassesEnseignant } from '../../api/personnel';
import { fetchClassesCourantes } from '../../api/classes';

// Classes auxquelles un enseignant a accès : celles de son emploi du temps (automatique) et celles que la direction
// lui affecte ici. Il ne voit que ces classes et leurs élèves, jamais les autres.
export function ClassesEnseignant({ personnelId }: { personnelId: string }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['classes-enseignant', personnelId], queryFn: () => fetchClassesEnseignant(personnelId) });
  const { data: classesCourantes } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes });
  const [affectees, setAffectees] = useState<string[]>([]);

  useEffect(() => {
    if (data) setAffectees(data.classes.filter((c) => c.affectee).map((c) => c.classeId));
  }, [data]);

  const enregistrer = useMutation({
    mutationFn: () => definirClassesEnseignant(personnelId, affectees),
    onSuccess: (resultat) => {
      queryClient.setQueryData(['classes-enseignant', personnelId], resultat);
      notifications.show({ message: "Classes de l'enseignant mises à jour", color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'enregistrement", color: 'red' }),
  });

  const dejaAffectees = data?.classes.filter((c) => c.affectee).map((c) => c.classeId).sort().join(',') ?? '';
  const inchange = dejaAffectees === [...affectees].sort().join(',');

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="xs">
        Classes accessibles{data?.anneeScolaire ? ` (${data.anneeScolaire.libelle})` : ''}
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        Cet enseignant n'accède qu'aux classes de son emploi du temps, plus celles que vous lui affectez ci-dessous, et
        aux élèves de ces classes. Pour qu'il puisse se connecter, créez son compte (rôle Enseignant) dans{' '}
        <Anchor component={Link} to="/utilisateurs" size="xs">
          Établissement › Utilisateurs
        </Anchor>{' '}
        et reliez-le à cette fiche.
      </Text>

      {data && data.classes.length === 0 && <Text c="dimmed">Aucune classe pour le moment : il ne verra aucun élève.</Text>}
      {data && data.classes.length > 0 && (
        <Group gap="xs" mb="md">
          {data.classes.map((c) => (
            <Group key={c.classeId} gap={4}>
              <Badge variant="light" color="indigo">
                {c.nom} ({c.niveau})
              </Badge>
              {c.viaEmploiDuTemps && (
                <Badge variant="outline" color="gray" size="xs">
                  emploi du temps
                </Badge>
              )}
              {c.affectee && (
                <Badge variant="outline" color="green" size="xs">
                  affectée
                </Badge>
              )}
            </Group>
          ))}
        </Group>
      )}

      <Stack gap="xs">
        <MultiSelect
          label="Classes affectées en plus de l'emploi du temps"
          placeholder="Choisir des classes"
          data={(classesCourantes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={affectees}
          onChange={setAffectees}
          searchable
          clearable
          nothingFoundMessage="Aucune classe"
          maw={520}
        />
        <Group>
          <Button disabled={inchange} loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
            Enregistrer les classes
          </Button>
        </Group>
      </Stack>
    </Paper>
  );
}
