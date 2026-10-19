import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Divider, Group, Modal, Paper, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPencil } from '@tabler/icons-react';
import { modifierFiliation, type ContactPrincipal } from '../../api/eleves';
import { ChampsPersonne, PERSONNE_VIDE, type Personne } from '../../components/ChampsFiliation';

interface Lien {
  id: string;
  lien: string;
  contactPrincipal: boolean;
  parentTuteur: { prenom: string; nom: string; telephone: string | null; email?: string | null; profession: string | null };
}

function personne(lien?: Lien): Personne {
  if (!lien) return PERSONNE_VIDE;
  const p = lien.parentTuteur;
  return { prenom: p.prenom ?? '', nom: p.nom ?? '', telephone: p.telephone ?? '', profession: p.profession ?? '' };
}

function Carte({ titre, lien }: { titre: string; lien?: Lien }) {
  return (
    <div>
      <Text size="sm" c="dimmed">
        {titre}
      </Text>
      {lien ? (
        <>
          <Text fw={600}>
            {lien.parentTuteur.prenom} {lien.parentTuteur.nom}
          </Text>
          {lien.parentTuteur.telephone && <Text size="sm">{lien.parentTuteur.telephone}</Text>}
          {lien.parentTuteur.profession && (
            <Text size="sm" c="dimmed">
              {lien.parentTuteur.profession}
            </Text>
          )}
        </>
      ) : (
        <Text c="dimmed">Non renseigné</Text>
      )}
    </div>
  );
}

// Filiation (père, mère) et autres parents / tuteurs de l'élève ; le contact principal reçoit les SMS.
export function Filiation({ eleveId, liens, modifiable }: { eleveId: string; liens: Lien[]; modifiable: boolean }) {
  const queryClient = useQueryClient();
  const pere = liens.find((l) => l.lien === 'Père');
  const mere = liens.find((l) => l.lien === 'Mère');
  const autres = liens.filter((l) => l !== pere && l !== mere);
  const [ouvert, setOuvert] = useState(false);
  const [saisiePere, setSaisiePere] = useState<Personne>(PERSONNE_VIDE);
  const [saisieMere, setSaisieMere] = useState<Personne>(PERSONNE_VIDE);
  const contactLien = liens.find((l) => l.contactPrincipal);
  const [saisieContact, setSaisieContact] = useState<ContactPrincipal>({ prenom: '', nom: '', telephone: '', email: '', lien: 'Parent' });

  const ouvrir = () => {
    setSaisiePere(personne(pere));
    setSaisieMere(personne(mere));
    const p = contactLien?.parentTuteur;
    setSaisieContact({
      prenom: p?.prenom ?? '',
      nom: p?.nom ?? '',
      telephone: p?.telephone ?? '',
      email: p?.email ?? '',
      lien: contactLien?.lien ?? 'Parent',
    });
    setOuvert(true);
  };
  const enregistrer = useMutation({
    // Contact principal envoyé seulement s'il est renseigné (prénom et nom), sinon laissé tel quel
    mutationFn: () =>
      modifierFiliation(eleveId, {
        pere: saisiePere,
        mere: saisieMere,
        ...(saisieContact.prenom.trim() && saisieContact.nom.trim() ? { contact: saisieContact } : {}),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
      notifications.show({ message: 'Filiation enregistrée', color: 'green' });
      setOuvert(false);
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'enregistrement", color: 'red' }),
  });

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Filiation et parents / tuteurs</Title>
        {modifiable && (
          <Button size="xs" variant="light" leftSection={<IconPencil size={14} />} onClick={ouvrir}>
            Modifier la filiation
          </Button>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} mb={autres.length ? 'sm' : 0}>
        <Carte titre="Père" lien={pere} />
        <Carte titre="Mère" lien={mere} />
      </SimpleGrid>
      {autres.length > 0 && (
        <Group gap="xs">
          {autres.map((lien) => (
            <Badge key={lien.id} variant={lien.contactPrincipal ? 'filled' : 'light'}>
              {lien.parentTuteur.prenom} {lien.parentTuteur.nom} ({lien.lien}
              {lien.parentTuteur.telephone ? ` · ${lien.parentTuteur.telephone}` : ''}
              {lien.contactPrincipal ? ' · contact principal' : ''})
            </Badge>
          ))}
        </Group>
      )}

      <Modal opened={ouvert} onClose={() => setOuvert(false)} title="Filiation de l'élève" size="lg">
        <Stack>
          <ChampsPersonne titre="Père" valeur={saisiePere} onChange={setSaisiePere} />
          <ChampsPersonne titre="Mère" valeur={saisieMere} onChange={setSaisieMere} />
          <Text size="xs" c="dimmed">
            Laisser prénom et nom vides retire le parent de la filiation.
          </Text>
          <Divider />
          <Text fw={600} size="sm">
            Parent / tuteur à contacter (SMS, rappels)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {(
              [
                ['prenom', 'Prénom'],
                ['nom', 'Nom'],
                ['telephone', 'Téléphone'],
                ['email', 'Email'],
                ['lien', 'Lien (Parent, Oncle, Tuteur...)'],
              ] as [keyof ContactPrincipal, string][]
            ).map(([cle, label]) => (
              <TextInput
                key={cle}
                label={label}
                value={saisieContact[cle]}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setSaisieContact((c) => ({ ...c, [cle]: v }));
                }}
              />
            ))}
          </SimpleGrid>
          <Group justify="flex-end">
            <Button loading={enregistrer.isPending} onClick={() => enregistrer.mutate()}>
              Enregistrer
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Paper>
  );
}
