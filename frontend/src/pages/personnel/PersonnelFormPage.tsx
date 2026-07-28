import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { TextInput, Button, Title, Stack, Paper, SegmentedControl, NumberInput, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createPersonnel, type TypePersonnel } from '../../api/personnel';

export function PersonnelFormPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [type, setType] = useState<TypePersonnel>('ADMINISTRATIF');
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [fonction, setFonction] = useState('');
  const [telephone, setTelephone] = useState('');
  const [email, setEmail] = useState('');
  const [salaireBase, setSalaireBase] = useState<number | ''>('');

  const mutation = useMutation({
    mutationFn: () =>
      createPersonnel({
        nom,
        prenom,
        fonction,
        type,
        telephone: telephone || undefined,
        email: email || undefined,
        salaireBase: type === 'ADMINISTRATIF' && salaireBase !== '' ? Number(salaireBase) : undefined,
      }),
    onSuccess: (personnel) => {
      queryClient.invalidateQueries({ queryKey: ['personnel'] });
      notifications.show({ message: 'Membre du personnel créé avec succès', color: 'green' });
      navigate(`/personnel/${personnel.id}`);
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création du personnel', color: 'red' }),
  });

  return (
    <Paper withBorder p="lg" maw={520}>
      <Title order={2} mb="md">
        Nouveau membre du personnel
      </Title>
      <Stack>
        <div>
          <Text size="sm" fw={500} mb={4}>
            Type
          </Text>
          <SegmentedControl
            value={type}
            onChange={(v) => setType(v as TypePersonnel)}
            data={[
              { label: 'Enseignant', value: 'ENSEIGNANT' },
              { label: 'Administratif', value: 'ADMINISTRATIF' },
            ]}
          />
        </div>
        <TextInput label="Nom" required value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
        <TextInput label="Prénom" required value={prenom} onChange={(e) => setPrenom(e.currentTarget.value)} />
        <TextInput
          label="Fonction"
          placeholder={type === 'ENSEIGNANT' ? 'ex: Professeur de Mathématiques' : 'ex: Secrétaire, Comptable'}
          required
          value={fonction}
          onChange={(e) => setFonction(e.currentTarget.value)}
        />
        <TextInput label="Téléphone (optionnel)" value={telephone} onChange={(e) => setTelephone(e.currentTarget.value)} />
        <TextInput label="Email (optionnel)" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />

        {type === 'ADMINISTRATIF' ? (
          <NumberInput
            label="Salaire de base mensuel (GNF)"
            value={salaireBase}
            onChange={(v) => setSalaireBase(v === '' ? '' : Number(v))}
          />
        ) : (
          <Text size="sm" c="dimmed">
            Le salaire d'un enseignant est calculé à partir des heures et taux horaires de ses classes, à définir sur sa
            fiche après création.
          </Text>
        )}

        <Button disabled={!nom || !prenom || !fonction} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Créer le membre du personnel
        </Button>
      </Stack>
    </Paper>
  );
}
