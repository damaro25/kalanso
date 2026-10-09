import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconId, IconInfoCircle } from '@tabler/icons-react';
import { fetchApercuCartesClasse, messageErreurCarte, ouvrirCartesClasse, type SourcePhoto } from '../../api/cartes';
import { fetchClassesCourantes } from '../../api/classes';

const BADGE_PHOTO: Record<SourcePhoto | 'AUCUNE', { label: string; color: string }> = {
  ELEVE: { label: 'Fiche élève', color: 'green' },
  ADMISSION: { label: 'Admission', color: 'blue' },
  AUCUNE: { label: 'Manquante', color: 'red' },
};

function Chiffre({ label, valeur, color }: { label: string; valeur: string; color?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {valeur}
      </Text>
    </Paper>
  );
}

// Impression des cartes scolaires d'une classe : planches A4 de 10 cartes (recto puis verso en miroir).
export function CartesScolairesPage() {
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);

  const { data: classes } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes });

  const niveaux = [...new Map((classes ?? []).map((c) => [c.niveau.id, c.niveau.nom])).entries()].map(([value, label]) => ({ value, label }));
  const classesVisibles = (classes ?? []).filter((c) => !niveauId || c.niveau.id === niveauId);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['cartes-classe', classeId],
    queryFn: () => fetchApercuCartesClasse(classeId!),
    enabled: !!classeId,
    placeholderData: keepPreviousData,
  });

  const generer = useMutation({
    mutationFn: () => ouvrirCartesClasse(classeId!),
    onError: async (e: any) => notifications.show({ message: await messageErreurCarte(e, 'Impossible de générer les cartes'), color: 'red' }),
  });

  return (
    <Stack>
      <div>
        <Title order={2}>Cartes scolaires</Title>
        <Text c="dimmed" size="sm">
          Choisissez une classe de l'année en cours pour imprimer les cartes de tous ses élèves
        </Text>
      </div>

      <Group gap="sm" align="flex-end">
        <Select
          label="Niveau"
          placeholder="Tous les niveaux"
          data={niveaux}
          value={niveauId}
          onChange={(v) => {
            setNiveauId(v);
            if (classeId && v && !classes?.some((c) => c.id === classeId && c.niveau.id === v)) setClasseId(null);
          }}
          clearable
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Classe"
          placeholder="Choisir une classe"
          data={classesVisibles.map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          w={{ base: '100%', sm: 260 }}
        />
        <Button leftSection={<IconId size={16} stroke={1.5} />} disabled={!classeId || !data || data.resume.eleves === 0} loading={generer.isPending} onClick={() => generer.mutate()}>
          Générer les cartes (PDF)
        </Button>
      </Group>

      {isLoading && <Text c="dimmed">Chargement...</Text>}
      {isError && <Text c="red">Impossible de charger la classe : {(error as any)?.response?.data?.message ?? 'le serveur ne répond pas'}.</Text>}

      {data && classeId && (
        <>
          <SimpleGrid cols={{ base: 2, md: 3 }}>
            <Chiffre label="Élèves" valeur={String(data.resume.eleves)} />
            <Chiffre label="Sans photo" valeur={String(data.resume.sansPhoto)} color={data.resume.sansPhoto > 0 ? 'red' : 'green'} />
            <Chiffre label="Planches A4 (10 cartes, recto verso)" valeur={String(Math.ceil(data.resume.eleves / 10))} />
          </SimpleGrid>

          {data.resume.sansPhoto > 0 && (
            <Alert icon={<IconInfoCircle size={18} />} color="orange" variant="light">
              {data.resume.sansPhoto} élève{data.resume.sansPhoto > 1 ? 's' : ''} sans photo : leur carte aura un cadre vide. Ouvrez la fiche de l'élève pour ajouter une photo.
            </Alert>
          )}

          <Text size="sm" c="dimmed">
            Impression : recto verso, feuille retournée sur le bord long, puis découpe le long du contour de chaque carte (format 85,6 × 54 mm).
          </Text>

          <Paper withBorder p="md">
            {data.eleves.length === 0 ? (
              <Text c="dimmed">Aucun élève inscrit dans cette classe.</Text>
            ) : (
              <Table.ScrollContainer minWidth={520}>
                <Table striped highlightOnHover verticalSpacing={6}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Matricule</Table.Th>
                      <Table.Th>Prénoms & Nom</Table.Th>
                      <Table.Th>Photo</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {data.eleves.map((e) => {
                      const badge = BADGE_PHOTO[e.photo ?? 'AUCUNE'];
                      return (
                        <Table.Tr key={e.eleveId}>
                          <Table.Td>{e.matricule}</Table.Td>
                          <Table.Td>
                            <Anchor component={Link} to={`/eleves/${e.eleveId}`} size="sm">
                              {e.nomComplet}
                            </Anchor>
                          </Table.Td>
                          <Table.Td>
                            <Badge variant="light" color={badge.color}>
                              {badge.label}
                            </Badge>
                          </Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </>
      )}
    </Stack>
  );
}
