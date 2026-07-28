import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Select, Table, Button, Group, Paper, TextInput, NumberInput, Stack, Text, Badge } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { confirmerSuppression } from '../../lib/confirm';
import { fetchClasses } from '../../api/classes';
import { fetchMatieres } from '../../api/notes';
import { fetchPersonnel } from '../../api/personnel';
import {
  fetchCreneaux,
  createCreneau,
  deleteCreneau,
  fetchSalles,
  createSalle,
  telechargerEmploiDuTempsXlsx,
  ouvrirEmploiDuTempsPdf,
  JOURS,
  type JourSemaine,
} from '../../api/emploiDuTemps';
import { useAuth } from '../../auth/AuthContext';

export function EmploiDuTempsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const peutModifier = user?.role === 'FONDATEUR' || user?.role === 'CHEF_ETABLISSEMENT';

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [classeId, setClasseId] = useState<string | null>(null);

  const [jour, setJour] = useState<string | null>('LUNDI');
  const [heureDebut, setHeureDebut] = useState('');
  const [heureFin, setHeureFin] = useState('');
  const [matiereId, setMatiereId] = useState<string | null>(null);
  const [personnelId, setPersonnelId] = useState<string | null>(null);
  const [salleId, setSalleId] = useState<string | null>(null);
  const [tauxHoraire, setTauxHoraire] = useState<number | ''>('');
  const [nouvelleSalle, setNouvelleSalle] = useState('');

  const classeChoisie = classes?.find((c) => c.id === classeId);
  const niveauId = classeChoisie?.niveau.id;

  const { data: creneaux } = useQuery({
    queryKey: ['creneaux', classeId],
    queryFn: () => fetchCreneaux(classeId!),
    enabled: !!classeId,
  });

  const { data: matieres } = useQuery({
    queryKey: ['matieres', niveauId],
    queryFn: () => fetchMatieres(niveauId),
    enabled: !!niveauId,
  });

  const { data: personnel } = useQuery({
    queryKey: ['personnel'],
    queryFn: fetchPersonnel,
    enabled: peutModifier,
  });

  const { data: salles } = useQuery({ queryKey: ['salles'], queryFn: fetchSalles });

  const salleMutation = useMutation({
    mutationFn: () => createSalle(nouvelleSalle),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['salles'] });
      notifications.show({ message: 'Salle créée', color: 'green' });
      setNouvelleSalle('');
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création de la salle', color: 'red' }),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createCreneau({
        classeId: classeId!,
        matiereId: matiereId!,
        personnelId: personnelId ?? undefined,
        salleId: salleId ?? undefined,
        jour: jour as JourSemaine,
        heureDebut,
        heureFin,
        tauxHoraire: tauxHoraire === '' ? undefined : Number(tauxHoraire),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creneaux', classeId] });
      notifications.show({ message: 'Créneau ajouté', color: 'green' });
      setHeureDebut('');
      setHeureFin('');
      setMatiereId(null);
      setPersonnelId(null);
      setSalleId(null);
      setTauxHoraire('');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Erreur lors de l'ajout du créneau";
      notifications.show({ message, color: 'red' });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCreneau(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['creneaux', classeId] });
      notifications.show({ message: 'Créneau supprimé', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Erreur lors de la suppression', color: 'red' }),
  });

  return (
    <Stack>
      <Title order={2}>Emplois du temps</Title>

      <Group>
        <Select
          placeholder="Choisir une classe"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          w={280}
        />
        {classeId && (
          <>
            <Button
              variant="light"
              leftSection={<IconDownload size={16} stroke={1.5} />}
              onClick={() => telechargerEmploiDuTempsXlsx(classeId)}
            >
              Télécharger l'emploi du temps
            </Button>
            <Button variant="light" leftSection={<IconEye size={16} stroke={1.5} />} onClick={() => ouvrirEmploiDuTempsPdf(classeId)}>
              Voir l'emploi du temps
            </Button>
          </>
        )}
      </Group>

      {classeId && peutModifier && (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Nouveau créneau
          </Title>
          <Group>
            <Select data={JOURS} value={jour} onChange={setJour} w={140} />
            <TextInput placeholder="Début (ex: 08:00)" value={heureDebut} onChange={(e) => setHeureDebut(e.currentTarget.value)} w={140} />
            <TextInput placeholder="Fin (ex: 09:30)" value={heureFin} onChange={(e) => setHeureFin(e.currentTarget.value)} w={140} />
            <Select
              placeholder="Matière"
              data={(matieres ?? []).map((m) => ({ value: m.id, label: m.nom }))}
              value={matiereId}
              onChange={setMatiereId}
              w={180}
            />
            <Select
              placeholder="Enseignant (optionnel)"
              data={(personnel ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }))}
              value={personnelId}
              onChange={setPersonnelId}
              clearable
              w={200}
            />
            <Select
              placeholder="Salle (optionnel)"
              data={(salles ?? []).map((s) => ({ value: s.id, label: s.nom }))}
              value={salleId}
              onChange={setSalleId}
              clearable
              w={160}
            />
            {personnelId && (
              <NumberInput
                placeholder="Taux horaire (GNF)"
                min={0}
                value={tauxHoraire}
                onChange={(v) => setTauxHoraire(v === '' ? '' : Number(v))}
                w={160}
              />
            )}
            <Button
              disabled={!jour || !heureDebut || !heureFin || !matiereId}
              loading={createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Ajouter
            </Button>
          </Group>
          <Group mt="sm">
            <TextInput
              placeholder="Nouvelle salle (ex: Salle B2)"
              value={nouvelleSalle}
              onChange={(e) => setNouvelleSalle(e.currentTarget.value)}
              w={220}
            />
            <Button variant="light" disabled={!nouvelleSalle} loading={salleMutation.isPending} onClick={() => salleMutation.mutate()}>
              Créer la salle
            </Button>
          </Group>
        </Paper>
      )}

      {classeId && creneaux && creneaux.length === 0 && (
        <Text c="dimmed">Aucun créneau défini pour cette classe.</Text>
      )}

      {classeId &&
        creneaux &&
        JOURS.map(({ value: valeurJour, label }) => {
          const creneauxDuJour = creneaux.filter((c) => c.jour === valeurJour);
          if (creneauxDuJour.length === 0) return null;
          return (
            <Paper key={valeurJour} withBorder p="md">
              <Title order={4} mb="sm">
                {label}
              </Title>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Horaire</Table.Th>
                    <Table.Th>Matière</Table.Th>
                    <Table.Th>Enseignant</Table.Th>
                    <Table.Th>Taux horaire</Table.Th>
                    <Table.Th>Salle</Table.Th>
                    {peutModifier && <Table.Th />}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {creneauxDuJour.map((c) => (
                    <Table.Tr key={c.id}>
                      <Table.Td>
                        {c.heureDebut} – {c.heureFin}
                      </Table.Td>
                      <Table.Td>
                        <Badge variant="light">{c.matiere.nom}</Badge>
                      </Table.Td>
                      <Table.Td>{c.personnel ? `${c.personnel.prenom} ${c.personnel.nom}` : '—'}</Table.Td>
                      <Table.Td>{c.tauxHoraire ? `${Number(c.tauxHoraire).toLocaleString('fr-FR')} GNF` : '—'}</Table.Td>
                      <Table.Td>{c.salle ? c.salle.nom : '—'}</Table.Td>
                      {peutModifier && (
                        <Table.Td>
                          <Button
                            size="xs"
                            color="red"
                            variant="subtle"
                            loading={deleteMutation.isPending}
                            onClick={() =>
                              confirmerSuppression({
                                message: `Voulez-vous vraiment supprimer le créneau de ${c.matiere.nom} (${c.heureDebut} – ${c.heureFin}) ? Cette action est définitive.`,
                                onConfirm: () => deleteMutation.mutate(c.id),
                              })
                            }
                          >
                            Supprimer
                          </Button>
                        </Table.Td>
                      )}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Paper>
          );
        })}
    </Stack>
  );
}
