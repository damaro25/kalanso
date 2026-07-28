import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Select,
  Table,
  Button,
  Group,
  Paper,
  Textarea,
  Stack,
  Text,
  Badge,
  SegmentedControl,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchClasses, fetchClasseEleves } from '../../api/classes';
import { fetchMessages, envoyerMessage } from '../../api/communication';
import { useAuth } from '../../auth/AuthContext';

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  MANUEL: { label: 'Manuel', color: 'blue' },
  ABSENCE: { label: 'Absence', color: 'orange' },
  RAPPEL_IMPAYE: { label: 'Rappel impayé', color: 'red' },
};

const STATUT_COLORS: Record<string, string> = {
  ENVOYE: 'green',
  ECHEC: 'red',
  EN_ATTENTE: 'gray',
};

export function CommunicationPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const peutEnvoyer = user?.role === 'FONDATEUR' || user?.role === 'CHEF_ETABLISSEMENT' || user?.role === 'SECRETAIRE';

  const [cible, setCible] = useState<'CLASSE' | 'ELEVE'>('CLASSE');
  const [classeId, setClasseId] = useState<string | null>(null);
  const [eleveId, setEleveId] = useState<string | null>(null);
  const [contenu, setContenu] = useState('');

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const { data: eleves } = useQuery({
    queryKey: ['classe-eleves', classeId],
    queryFn: () => fetchClasseEleves(classeId!),
    enabled: !!classeId && cible === 'ELEVE',
  });
  const { data: messages, isLoading } = useQuery({ queryKey: ['messages-parents'], queryFn: fetchMessages });

  const mutation = useMutation({
    mutationFn: () =>
      envoyerMessage(
        cible === 'ELEVE' ? { contenu, eleveId: eleveId! } : { contenu, classeId: classeId! },
      ),
    onSuccess: (resultat: any) => {
      queryClient.invalidateQueries({ queryKey: ['messages-parents'] });
      const detail = Array.isArray(resultat)
        ? `${resultat.length} SMS envoyé(s)`
        : `${resultat.envoyes} SMS envoyé(s)${resultat.elevesSansContact > 0 ? `, ${resultat.elevesSansContact} élève(s) sans contact` : ''}`;
      notifications.show({ message: `Message envoyé — ${detail}`, color: 'green' });
      setContenu('');
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Erreur lors de l'envoi";
      notifications.show({ message, color: 'red' });
    },
  });

  const envoiPossible = contenu.trim().length > 0 && (cible === 'CLASSE' ? !!classeId : !!eleveId);

  return (
    <Stack>
      <Title order={2}>Communication parents</Title>

      {peutEnvoyer && (
        <Paper withBorder p="md">
          <Title order={4} mb="sm">
            Nouveau message (SMS)
          </Title>
          <Stack>
            <Group>
              <SegmentedControl
                value={cible}
                onChange={(v) => setCible(v as 'CLASSE' | 'ELEVE')}
                data={[
                  { label: 'Toute une classe', value: 'CLASSE' },
                  { label: 'Un élève', value: 'ELEVE' },
                ]}
              />
              <Select
                placeholder="Choisir une classe"
                data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
                value={classeId}
                onChange={(v) => {
                  setClasseId(v);
                  setEleveId(null);
                }}
                w={220}
              />
              {cible === 'ELEVE' && (
                <Select
                  placeholder="Choisir un élève"
                  data={(eleves ?? []).map((e: any) => ({ value: e.id, label: `${e.prenom} ${e.nom}` }))}
                  value={eleveId}
                  onChange={setEleveId}
                  w={220}
                />
              )}
            </Group>
            <Textarea
              placeholder="Contenu du message (ex: Réunion parents-enseignants samedi à 10h)"
              value={contenu}
              onChange={(e) => setContenu(e.currentTarget.value)}
              minRows={2}
              autosize
            />
            <Group>
              <Button disabled={!envoiPossible} loading={mutation.isPending} onClick={() => mutation.mutate()}>
                Envoyer aux parents
              </Button>
            </Group>
          </Stack>
        </Paper>
      )}

      <Title order={4}>Journal des messages</Title>

      {isLoading && <p>Chargement...</p>}
      {messages && messages.length === 0 && <Text c="dimmed">Aucun message envoyé pour l'instant.</Text>}

      {messages && messages.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Date</Table.Th>
              <Table.Th>Élève</Table.Th>
              <Table.Th>Parent</Table.Th>
              <Table.Th>Téléphone</Table.Th>
              <Table.Th>Type</Table.Th>
              <Table.Th>Statut</Table.Th>
              <Table.Th>Message</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {messages.map((m) => (
              <Table.Tr key={m.id}>
                <Table.Td>{new Date(m.createdAt).toLocaleString('fr-FR')}</Table.Td>
                <Table.Td>{m.eleve ? `${m.eleve.prenom} ${m.eleve.nom}` : '—'}</Table.Td>
                <Table.Td>{m.parentTuteur ? `${m.parentTuteur.prenom} ${m.parentTuteur.nom}` : '—'}</Table.Td>
                <Table.Td>{m.telephone}</Table.Td>
                <Table.Td>
                  <Badge color={TYPE_LABELS[m.type]?.color ?? 'gray'} variant="light">
                    {TYPE_LABELS[m.type]?.label ?? m.type}
                  </Badge>
                </Table.Td>
                <Table.Td>
                  <Badge color={STATUT_COLORS[m.statut] ?? 'gray'}>{m.statut}</Badge>
                </Table.Td>
                <Table.Td maw={320}>
                  <Text size="sm" lineClamp={2}>
                    {m.contenu}
                  </Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}
    </Stack>
  );
}
