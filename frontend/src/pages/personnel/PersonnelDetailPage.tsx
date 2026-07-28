import { Link, useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Text,
  Paper,
  Group,
  Stack,
  TextInput,
  NumberInput,
  Button,
  Badge,
  SegmentedControl,
  Table,
  Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { confirmerSuppression } from '../../lib/confirm';
import {
  fetchPersonnelDetail,
  updatePersonnel,
  deletePersonnel,
  fetchSalaireEnseignant,
  type TypePersonnel,
} from '../../api/personnel';
import { JOURS } from '../../api/emploiDuTemps';

export function PersonnelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<TypePersonnel>('ADMINISTRATIF');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [fonction, setFonction] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [salaireBase, setSalaireBase] = useState<number | ''>('');

  const { data: personnel, isLoading } = useQuery({
    queryKey: ['personnel-detail', id],
    queryFn: () => fetchPersonnelDetail(id!),
    enabled: !!id,
  });

  const estEnseignant = personnel?.type === 'ENSEIGNANT';

  const { data: salaire } = useQuery({
    queryKey: ['salaire-enseignant', id],
    queryFn: () => fetchSalaireEnseignant(id!),
    enabled: !!id && estEnseignant,
  });

  useEffect(() => {
    if (personnel) {
      setType(personnel.type);
      setNom(personnel.nom);
      setPrenom(personnel.prenom);
      setFonction(personnel.fonction);
      setTelephone(personnel.telephone ?? '');
      setEmail(personnel.email ?? '');
      setSalaireBase(personnel.salaireBase ? Number(personnel.salaireBase) : '');
    }
  }, [personnel]);

  const updateMutation = useMutation({
    mutationFn: () =>
      updatePersonnel(id!, {
        nom,
        prenom,
        fonction,
        type,
        telephone,
        email,
        salaireBase: type === 'ADMINISTRATIF' && salaireBase !== '' ? Number(salaireBase) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel-detail', id] });
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      notifications.show({ message: 'Informations mises à jour', color: 'green' });
    },
    onError: () => notifications.show({ message: 'Erreur lors de la mise à jour', color: 'red' }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePersonnel(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      notifications.show({ message: 'Membre du personnel supprimé', color: 'green' });
      navigate('/personnel');
    },
    onError: () => notifications.show({ message: 'Erreur lors de la suppression', color: 'red' }),
  });

  if (isLoading || !personnel) return <p>Chargement...</p>;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Group gap="xs">
            <Title order={2}>
              {personnel.prenom} {personnel.nom}
            </Title>
            <Badge color={estEnseignant ? 'indigo' : 'gray'}>
              {estEnseignant ? 'Enseignant' : 'Administratif'}
            </Badge>
          </Group>
          <Text c="dimmed">{personnel.fonction}</Text>
        </div>
        <Button
          color="red"
          variant="light"
          onClick={() =>
            confirmerSuppression({
              message: `Voulez-vous vraiment supprimer ${personnel.prenom} ${personnel.nom} ? Cette action désactive le compte, il n'apparaîtra plus dans la liste du personnel.`,
              onConfirm: () => deleteMutation.mutate(),
            })
          }
        >
          Supprimer
        </Button>
      </Group>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Informations
        </Title>
        <Stack>
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v as TypePersonnel)}
            data={[
              { label: 'Enseignant', value: 'ENSEIGNANT' },
              { label: 'Administratif', value: 'ADMINISTRATIF' },
            ]}
          />
          <Group>
            <TextInput label="Nom" value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
            <TextInput label="Prénom" value={prenom} onChange={(e) => setPrenom(e.currentTarget.value)} />
            <TextInput label="Fonction" value={fonction} onChange={(e) => setFonction(e.currentTarget.value)} />
            <TextInput label="Téléphone" value={telephone} onChange={(e) => setTelephone(e.currentTarget.value)} />
            <TextInput label="Email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
            {type === 'ADMINISTRATIF' && (
              <NumberInput
                label="Salaire de base (GNF)"
                value={salaireBase}
                onChange={(v) => setSalaireBase(v === '' ? '' : Number(v))}
              />
            )}
          </Group>
        </Stack>
        <Button mt="sm" loading={updateMutation.isPending} onClick={() => updateMutation.mutate()}>
          Enregistrer les modifications
        </Button>
      </Paper>

      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Emploi du temps</Title>
          <Anchor component={Link} to="/emploi-du-temps" size="sm">
            Gérer les créneaux →
          </Anchor>
        </Group>
        <Text size="xs" c="dimmed" mb="sm">
          Qui enseigne quoi, quand et à quel taux se gère depuis la page Emploi du temps — c'est ce planning réel qui
          sert de base au calcul du salaire ci-dessous.
        </Text>
        {personnel.creneaux.length === 0 && <Text c="dimmed">Aucun créneau assigné.</Text>}
        {personnel.creneaux.length > 0 && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Jour</Table.Th>
                <Table.Th>Horaire</Table.Th>
                <Table.Th>Classe</Table.Th>
                <Table.Th>Matière</Table.Th>
                <Table.Th>Salle</Table.Th>
                {estEnseignant && <Table.Th>Taux horaire</Table.Th>}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {personnel.creneaux.map((c: any) => (
                <Table.Tr key={c.id}>
                  <Table.Td>{JOURS.find((j) => j.value === c.jour)?.label ?? c.jour}</Table.Td>
                  <Table.Td>
                    {c.heureDebut} – {c.heureFin}
                  </Table.Td>
                  <Table.Td>{c.classe.nom}</Table.Td>
                  <Table.Td>{c.matiere.nom}</Table.Td>
                  <Table.Td>{c.salle ? c.salle.nom : '—'}</Table.Td>
                  {estEnseignant && (
                    <Table.Td>{c.tauxHoraire ? `${Number(c.tauxHoraire).toLocaleString('fr-FR')} GNF` : '—'}</Table.Td>
                  )}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {estEnseignant && salaire && (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Salaire de base calculé
          </Title>
          <Text size="sm" c="dimmed" mb="sm">
            {salaire.nombreClasses} classe(s), {salaire.totalHeures} h/mois au total.
          </Text>
          <Text fw={700} size="lg">
            {salaire.salaireBase.toLocaleString('fr-FR')} GNF / mois
          </Text>
          <Text size="xs" c="dimmed" mt="xs">
            Ce montant est utilisé automatiquement (verrouillé) comme salaire de base sur le bulletin de paie de l'enseignant.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
