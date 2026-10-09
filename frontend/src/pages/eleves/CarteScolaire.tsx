import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Box, Button, FileButton, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCamera, IconId, IconTrash, IconUser } from '@tabler/icons-react';
import {
  fetchInfoCarte,
  fetchPhotoEleve,
  messageErreurCarte,
  ouvrirCarteEleve,
  preparerPhoto,
  supprimerPhotoEleve,
  televerserPhotoEleve,
  type SourcePhoto,
} from '../../api/cartes';
import { useAuth } from '../../auth/AuthContext';

// Mêmes rôles que l'API des cartes : les autres n'ont pas accès à la photo ni à la carte.
const ROLES_CARTES = ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'SECRETAIRE'];

const ORIGINE: Record<SourcePhoto, string> = {
  ELEVE: 'Photo de la fiche élève',
  ADMISSION: "Photo déposée à l'admission",
};

// Photo et carte scolaire d'un élève : ajout ou remplacement de la photo, puis génération de la carte (PDF).
export function CarteScolaire({ eleveId }: { eleveId: string }) {
  const { user } = useAuth();
  const autorise = !!user && ROLES_CARTES.includes(user.role);
  const queryClient = useQueryClient();

  const { data: info } = useQuery({
    queryKey: ['carte-info', eleveId],
    queryFn: () => fetchInfoCarte(eleveId),
    enabled: autorise,
    retry: false,
  });

  // L'URL temporaire de l'image reste dans l'état du composant et non dans React Query : le cache de requêtes
  // est conservé pour le hors-ligne, et une URL de blob ne survit pas à un rechargement de la page.
  const [apercu, setApercu] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const origine = info?.photo ?? null;

  useEffect(() => {
    if (!autorise || !origine) {
      setApercu(null);
      return;
    }
    let annule = false;
    let url: string | null = null;
    fetchPhotoEleve(eleveId)
      .then((blob) => {
        if (annule) return;
        url = URL.createObjectURL(blob);
        setApercu(url);
      })
      .catch(() => setApercu(null));
    return () => {
      annule = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [autorise, eleveId, origine, version]);

  const apresChangement = () => {
    queryClient.invalidateQueries({ queryKey: ['carte-info', eleveId] });
    queryClient.invalidateQueries({ queryKey: ['cartes-classe'] });
    setVersion((v) => v + 1);
  };

  const televerser = useMutation({
    mutationFn: async (fichier: File) => televerserPhotoEleve(eleveId, await preparerPhoto(fichier)),
    onSuccess: () => {
      apresChangement();
      notifications.show({ message: 'Photo enregistrée', color: 'green' });
    },
    onError: async (e: any) => notifications.show({ message: await messageErreurCarte(e, "Impossible d'enregistrer la photo"), color: 'red' }),
  });

  const retirer = useMutation({
    mutationFn: () => supprimerPhotoEleve(eleveId),
    onSuccess: () => {
      apresChangement();
      notifications.show({ message: 'Photo retirée de la fiche', color: 'green' });
    },
    onError: async (e: any) => notifications.show({ message: await messageErreurCarte(e, 'Impossible de retirer la photo'), color: 'red' }),
  });

  const generer = useMutation({
    mutationFn: () => ouvrirCarteEleve(eleveId),
    onError: async (e: any) => notifications.show({ message: await messageErreurCarte(e, 'Impossible de générer la carte'), color: 'red' }),
  });

  if (!autorise || !info) return null;

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        Carte scolaire
      </Title>
      <Group align="flex-start" wrap="nowrap" gap="md">
        <Box
          w={96}
          h={128}
          style={{
            flexShrink: 0,
            border: '1px solid var(--mantine-color-gray-4)',
            borderRadius: 4,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'var(--mantine-color-gray-0)',
          }}
        >
          {apercu ? (
            <img src={apercu} alt={`Photo de ${info.nomComplet}`} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          ) : (
            <IconUser size={40} stroke={1.2} color="var(--mantine-color-gray-5)" />
          )}
        </Box>

        <Stack gap="xs" style={{ flex: 1, minWidth: 0 }}>
          <Text size="sm" c={origine ? undefined : 'dimmed'}>
            {origine ? ORIGINE[origine] : 'Aucune photo : la carte aura un cadre vide'}
          </Text>
          <Group gap="xs">
            <FileButton onChange={(f) => f && televerser.mutate(f)} accept="image/*">
              {(props) => (
                <Button variant="light" leftSection={<IconCamera size={16} stroke={1.5} />} loading={televerser.isPending} {...props}>
                  {origine ? 'Changer la photo' : 'Ajouter une photo'}
                </Button>
              )}
            </FileButton>
            {origine === 'ELEVE' && (
              <Button variant="subtle" color="red" leftSection={<IconTrash size={16} stroke={1.5} />} loading={retirer.isPending} onClick={() => retirer.mutate()}>
                Retirer la photo
              </Button>
            )}
            <Button leftSection={<IconId size={16} stroke={1.5} />} disabled={!info.peutGenerer} loading={generer.isPending} onClick={() => generer.mutate()}>
              Générer la carte (PDF)
            </Button>
          </Group>
          {!info.peutGenerer && (
            <Text size="xs" c="dimmed">
              Affectez d'abord l'élève à une classe de l'année {info.anneeScolaire.libelle} pour générer sa carte.
            </Text>
          )}
          {info.peutGenerer && info.classe && (
            <Text size="xs" c="dimmed">
              Classe {info.classe.nom}, année {info.anneeScolaire.libelle}. Pour imprimer toute une classe, voir la page « Cartes scolaires ».
            </Text>
          )}
        </Stack>
      </Group>
    </Paper>
  );
}
