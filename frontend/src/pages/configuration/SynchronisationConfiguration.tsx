import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Divider, Group, NumberInput, Paper, PasswordInput, SimpleGrid, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDatabase, IconPlugConnected, IconRefresh } from '@tabler/icons-react';
import { enregistrerConfigSync, fetchConfigSync, synchroniserMaintenant, testerBaseSync, testerSync, type ReglagesSync } from '../../api/sync';

const erreur = (e: any, defaut: string) => notifications.show({ message: e?.response?.data?.message ?? defaut, color: 'red', autoClose: 8000 });

// « Serveur de synchronisation » (version bureau, fondateur) : adresse du serveur, compte de synchronisation,
// activation ; le PC envoie ses changements au serveur et reçoit ceux des autres, toutes les 2 minutes.
export function SynchronisationConfiguration() {
  const queryClient = useQueryClient();
  const { data: config } = useQuery({ queryKey: ['sync-config'], queryFn: fetchConfigSync, refetchInterval: 30_000 });
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [bd, setBd] = useState({ bdHote: '', bdPort: 5432 as number | '', bdNom: '', bdUtilisateur: '', bdMotDePasse: '' });

  useEffect(() => {
    if (config?.modeBureau) {
      setUrl(config.urlServeur ?? '');
      setEmail(config.email ?? '');
      setBd((b) => ({
        ...b,
        bdHote: config.bdHote ?? '',
        bdPort: config.bdPort ?? 5432,
        bdNom: config.bdNom ?? '',
        bdUtilisateur: config.bdUtilisateur ?? '',
      }));
    }
  }, [config?.modeBureau, config?.urlServeur, config?.email, config?.bdHote, config?.bdPort, config?.bdNom, config?.bdUtilisateur]);

  // Réglages saisis (mots de passe envoyés seulement s'ils ont été tapés)
  const reglages = (): ReglagesSync => ({
    urlServeur: url,
    email,
    ...(motDePasse ? { motDePasse } : {}),
    bdHote: bd.bdHote,
    bdPort: bd.bdPort === '' ? null : bd.bdPort,
    bdNom: bd.bdNom,
    bdUtilisateur: bd.bdUtilisateur,
    ...(bd.bdMotDePasse ? { bdMotDePasse: bd.bdMotDePasse } : {}),
  });
  const viderMotsDePasse = () => {
    setMotDePasse('');
    setBd((b) => ({ ...b, bdMotDePasse: '' }));
  };

  const enregistrer = useMutation({
    mutationFn: (actif?: boolean) => enregistrerConfigSync({ ...reglages(), ...(actif === undefined ? {} : { actif }) }),
    onSuccess: (data) => {
      queryClient.setQueryData(['sync-config'], data);
      viderMotsDePasse();
      notifications.show({ message: 'Réglages de synchronisation enregistrés', color: 'green' });
    },
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement"),
  });
  const tester = useMutation({
    mutationFn: async () => {
      await enregistrerConfigSync(reglages());
      viderMotsDePasse();
      return testerSync();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      notifications.show({ message: r.message, color: 'green' });
    },
    onError: (e) => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      erreur(e, 'Connexion impossible');
    },
  });
  const testerBase = useMutation({
    mutationFn: async () => {
      await enregistrerConfigSync(reglages());
      viderMotsDePasse();
      return testerBaseSync();
    },
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      notifications.show({ message: r.message, color: 'green' });
    },
    onError: (e) => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      erreur(e, 'Connexion à la base impossible');
    },
  });
  const synchroniser = useMutation({
    mutationFn: synchroniserMaintenant,
    onSuccess: (r) => {
      // Données reçues du serveur : tout l'affichage se recharge
      queryClient.invalidateQueries();
      notifications.show({ message: r.etat, color: 'green' });
    },
    onError: (e) => {
      queryClient.invalidateQueries({ queryKey: ['sync-config'] });
      erreur(e, 'Échec de la synchronisation');
    },
  });

  // Dans la version web (le serveur), rien à régler ici
  if (!config?.modeBureau) return null;

  function lancer() {
    if (config?.initialise) {
      synchroniser.mutate();
      return;
    }
    modals.openConfirmModal({
      title: 'Première synchronisation',
      centered: true,
      children: (
        <Text size="sm">
          Ce PC va repartir des données du serveur : les données actuellement sur ce PC seront <strong>remplacées</strong> par
          celles du serveur. Ensuite, chaque changement fait ici sera envoyé au serveur, et inversement.
        </Text>
      ),
      labels: { confirm: 'Synchroniser', cancel: 'Annuler' },
      confirmProps: { color: 'orange' },
      onConfirm: () => synchroniser.mutate(),
    });
  }

  const configure = !!(config.urlServeur && config.email && config.motDePasseEnregistre);
  const etatOk = config.dernierEtat?.startsWith('OK');

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Serveur de synchronisation</Title>
        <Group gap="xs">
          {config.poste && <Badge variant="light">Poste {config.poste}</Badge>}
          <Badge color={!configure ? 'gray' : config.actif ? 'green' : 'yellow'} variant="light">
            {!configure ? 'Non configuré' : config.actif ? 'Synchronisation active' : 'Synchronisation en pause'}
          </Badge>
        </Group>
      </Group>
      <Text size="sm" c="dimmed" mb="sm">
        Ce PC travaille hors ligne et se synchronise avec le serveur de l'école (la base de la version web) dès qu'internet
        est disponible : toutes les 2 minutes, ou avec « Synchroniser maintenant ».
      </Text>
      <Stack>
        <TextInput label="Adresse du serveur" placeholder="https://ecole.mameta.gn" value={url} onChange={(e) => setUrl(e.currentTarget.value)} />
        <SimpleGrid cols={{ base: 1, sm: 2 }}>
          <TextInput label="Compte de synchronisation (e-mail)" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput
            label="Mot de passe"
            placeholder={config.motDePasseEnregistre ? '•••••••• enregistré' : ''}
            description={config.motDePasseEnregistre ? 'Laisser vide pour garder le mot de passe enregistré' : undefined}
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.currentTarget.value)}
          />
        </SimpleGrid>
        <Divider label="Base de données du serveur (PostgreSQL)" labelPosition="left" />
        <Text size="xs" c="dimmed">
          Les identifiants de la base de la version web, pour la vérifier depuis ce PC (« Tester la base »). Les données passent
          toujours par l'adresse du serveur ci-dessus : la base n'est jamais modifiée directement depuis ce PC.
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 3 }}>
          <TextInput label="Hôte" placeholder="ecole.mameta.gn" value={bd.bdHote} onChange={(e) => setBd({ ...bd, bdHote: e.currentTarget.value })} />
          <NumberInput label="Port" value={bd.bdPort} onChange={(v) => setBd({ ...bd, bdPort: v === '' ? '' : Number(v) })} min={1} max={65535} allowDecimal={false} />
          <TextInput label="Nom de la base" value={bd.bdNom} onChange={(e) => setBd({ ...bd, bdNom: e.currentTarget.value })} />
          <TextInput label="Utilisateur" value={bd.bdUtilisateur} onChange={(e) => setBd({ ...bd, bdUtilisateur: e.currentTarget.value })} />
          <PasswordInput
            label="Mot de passe de la base"
            placeholder={config.bdMotDePasseEnregistre ? '•••••••• enregistré' : ''}
            value={bd.bdMotDePasse}
            onChange={(e) => setBd({ ...bd, bdMotDePasse: e.currentTarget.value })}
          />
          <Button
            variant="light"
            mt={24}
            leftSection={<IconDatabase size={16} stroke={1.5} />}
            loading={testerBase.isPending}
            disabled={!bd.bdHote || !bd.bdNom || !bd.bdUtilisateur || (!bd.bdMotDePasse && !config.bdMotDePasseEnregistre)}
            onClick={() => testerBase.mutate()}
          >
            Tester la base
          </Button>
        </SimpleGrid>
        <Divider />
        <Switch
          label="Activer la synchronisation automatique"
          checked={!!config.actif}
          disabled={!configure && !config.actif}
          onChange={(e) => enregistrer.mutate(e.currentTarget.checked)}
        />
        <Group>
          <Button variant="default" loading={enregistrer.isPending} onClick={() => enregistrer.mutate(undefined)}>
            Enregistrer
          </Button>
          <Button
            variant="light"
            leftSection={<IconPlugConnected size={16} stroke={1.5} />}
            loading={tester.isPending}
            disabled={!url || !email}
            onClick={() => tester.mutate()}
          >
            Tester la connexion
          </Button>
          <Button leftSection={<IconRefresh size={16} stroke={1.5} />} loading={synchroniser.isPending} disabled={!configure} onClick={lancer}>
            Synchroniser maintenant
          </Button>
        </Group>
        {!configure && (
          <Alert variant="light" color="gray">
            Non configuré : renseignez l'adresse du serveur et le compte de synchronisation (un compte de la version web).
          </Alert>
        )}
        {configure && (
          <Text size="sm" c={config.dernierEtat && !etatOk ? 'red' : 'dimmed'}>
            Dernière synchronisation réussie : {config.derniereSyncLe ? new Date(config.derniereSyncLe).toLocaleString('fr-FR') : 'jamais'}
            {config.dernierEtat ? ` · ${config.dernierEtat}` : ''}
            {typeof config.enAttente === 'number' && config.enAttente > 0 ? ` · ${config.enAttente} changement(s) en attente d'envoi` : ''}
          </Text>
        )}
      </Stack>
    </Paper>
  );
}
