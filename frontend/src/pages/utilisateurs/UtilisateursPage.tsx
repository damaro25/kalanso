import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table, Title, Group, Paper, TextInput, PasswordInput, Select, Button, Stack, Text, Modal, Anchor, Badge, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { confirmerSuppression } from '../../lib/confirm';
import { ROLE_LABELS, type Role } from '../../lib/roles';
import {
  fetchUtilisateurs,
  createUtilisateur,
  updateUtilisateur,
  type Utilisateur,
} from '../../api/utilisateurs';
import { fetchPersonnel } from '../../api/personnel';

const OPTIONS_ROLE = (Object.keys(ROLE_LABELS) as Role[]).map((value) => ({ value, label: ROLE_LABELS[value] }));

export function UtilisateursPage() {
  const queryClient = useQueryClient();
  const { data: utilisateurs, isLoading } = useQuery({ queryKey: ['utilisateurs'], queryFn: fetchUtilisateurs });
  const { data: personnel } = useQuery({ queryKey: ['personnel'], queryFn: fetchPersonnel });

  // Un compte enseignant est relié à la fiche du personnel d'un enseignant : c'est elle qui détermine ses classes.
  // Une fiche ne peut servir qu'à un compte ; en modification, celle du compte lui-même reste proposée.
  const fichesPrises = new Set((utilisateurs ?? []).map((u) => u.personnelId).filter(Boolean));
  const fichesEnseignants = (gardee?: string | null) =>
    (personnel ?? [])
      .filter((p) => p.type === 'ENSEIGNANT' && (!fichesPrises.has(p.id) || p.id === gardee))
      .map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom}` }));

  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role | null>(null);
  const [personnelId, setPersonnelId] = useState<string | null>(null);

  function reinitialiserFormulaire() {
    setNom('');
    setPrenom('');
    setEmail('');
    setPassword('');
    setRole(null);
    setPersonnelId(null);
  }

  const mutation = useMutation({
    mutationFn: () => createUtilisateur({ nom, prenom, email, password, role: role!, personnelId: role === 'ENSEIGNANT' ? personnelId! : undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
      notifications.show({ message: 'Compte créé', color: 'green' });
      reinitialiserFormulaire();
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la création', color: 'red' }),
  });

  // Édition d'un compte existant
  const [utilisateurEnEdition, setUtilisateurEnEdition] = useState<Utilisateur | null>(null);
  const [nomEdition, setNomEdition] = useState('');
  const [prenomEdition, setPrenomEdition] = useState('');
  const [emailEdition, setEmailEdition] = useState('');
  const [roleEdition, setRoleEdition] = useState<Role | null>(null);
  const [nouveauMotDePasse, setNouveauMotDePasse] = useState('');
  const [personnelIdEdition, setPersonnelIdEdition] = useState<string | null>(null);

  function ouvrirEdition(u: Utilisateur) {
    setUtilisateurEnEdition(u);
    setNomEdition(u.nom);
    setPrenomEdition(u.prenom);
    setEmailEdition(u.email);
    setRoleEdition(u.role);
    setPersonnelIdEdition(u.personnelId ?? null);
    setNouveauMotDePasse('');
  }

  const editionMutation = useMutation({
    mutationFn: () =>
      updateUtilisateur(utilisateurEnEdition!.id, {
        nom: nomEdition,
        prenom: prenomEdition,
        email: emailEdition,
        role: roleEdition!,
        personnelId: roleEdition === 'ENSEIGNANT' ? personnelIdEdition : null,
        password: nouveauMotDePasse || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
      notifications.show({ message: 'Compte modifié', color: 'green' });
      setUtilisateurEnEdition(null);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  const statutMutation = useMutation({
    mutationFn: ({ id, actif }: { id: string; actif: boolean }) => updateUtilisateur(id, { actif }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['utilisateurs'] });
      notifications.show({ message: 'Statut du compte mis à jour', color: 'green' });
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la mise à jour', color: 'red' }),
  });

  function confirmerDesactivation(u: Utilisateur) {
    confirmerSuppression({
      titre: 'Désactiver le compte',
      message: `Désactiver le compte de ${u.prenom} ${u.nom} ? La personne ne pourra plus se connecter tant que le compte n'est pas réactivé.`,
      onConfirm: () => statutMutation.mutate({ id: u.id, actif: false }),
    });
  }

  return (
    <Stack>
      <Title order={2}>Utilisateurs</Title>
      <Text size="sm" c="dimmed">
        Gérez les comptes du personnel administratif (fondateur, chef d'établissement, secrétaire, comptable,
        enseignant) qui accèdent à La cible du formateur.
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Nouveau compte
        </Title>
        <Group align="flex-end">
          <TextInput label="Nom" value={nom} onChange={(e) => setNom(e.currentTarget.value)} />
          <TextInput label="Prénom" value={prenom} onChange={(e) => setPrenom(e.currentTarget.value)} />
          <TextInput label="Email" type="email" value={email} onChange={(e) => setEmail(e.currentTarget.value)} />
          <PasswordInput label="Mot de passe" value={password} onChange={(e) => setPassword(e.currentTarget.value)} />
          <Select label="Rôle" placeholder="Choisir un rôle" data={OPTIONS_ROLE} value={role} onChange={(v) => setRole(v as Role)} />
          {role === 'ENSEIGNANT' && (
            <Select
              label="Fiche de l'enseignant"
              description="Détermine ses classes"
              placeholder="Choisir l'enseignant"
              data={fichesEnseignants()}
              value={personnelId}
              onChange={setPersonnelId}
              searchable
              nothingFoundMessage="Aucun enseignant sans compte"
            />
          )}
          <Button
            disabled={!nom || !prenom || !email || password.length < 6 || !role || (role === 'ENSEIGNANT' && !personnelId)}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Créer
          </Button>
        </Group>
      </Paper>

      {isLoading && <p>Chargement...</p>}

      {utilisateurs && (
        <Table.ScrollContainer minWidth={620}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Email</Table.Th>
                <Table.Th>Rôle</Table.Th>
                <Table.Th>Fiche du personnel</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {utilisateurs.map((u) => (
                <Table.Tr key={u.id}>
                  <Table.Td>
                    {u.prenom} {u.nom}
                  </Table.Td>
                  <Table.Td>{u.email}</Table.Td>
                  <Table.Td>{ROLE_LABELS[u.role]}</Table.Td>
                  <Table.Td>
                    {u.personnel ? (
                      `${u.personnel.prenom} ${u.personnel.nom}`
                    ) : u.role === 'ENSEIGNANT' ? (
                      <Tooltip label="Tant que le compte n'est pas relié à une fiche, cet enseignant ne voit aucune classe. Cliquez sur Modifier.">
                        <Badge color="orange" variant="light">
                          Non reliée
                        </Badge>
                      </Tooltip>
                    ) : (
                      '—'
                    )}
                  </Table.Td>
                  <Table.Td>
                    <Badge color={u.actif ? 'green' : 'gray'} variant="light">
                      {u.actif ? 'Actif' : 'Désactivé'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="md">
                      <Anchor component="button" type="button" size="sm" onClick={() => ouvrirEdition(u)}>
                        Modifier
                      </Anchor>
                      {u.actif ? (
                        <Anchor component="button" type="button" size="sm" c="red" onClick={() => confirmerDesactivation(u)}>
                          Désactiver
                        </Anchor>
                      ) : (
                        <Anchor
                          component="button"
                          type="button"
                          size="sm"
                          c="kalanso"
                          onClick={() => statutMutation.mutate({ id: u.id, actif: true })}
                        >
                          Réactiver
                        </Anchor>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}

      <Modal opened={!!utilisateurEnEdition} onClose={() => setUtilisateurEnEdition(null)} title="Modifier le compte">
        <Stack>
          <TextInput label="Nom" value={nomEdition} onChange={(e) => setNomEdition(e.currentTarget.value)} />
          <TextInput label="Prénom" value={prenomEdition} onChange={(e) => setPrenomEdition(e.currentTarget.value)} />
          <TextInput label="Email" type="email" value={emailEdition} onChange={(e) => setEmailEdition(e.currentTarget.value)} />
          <Select label="Rôle" data={OPTIONS_ROLE} value={roleEdition} onChange={(v) => setRoleEdition(v as Role)} />
          {roleEdition === 'ENSEIGNANT' && (
            <Select
              label="Fiche de l'enseignant"
              description="Détermine ses classes : sans elle, il ne voit aucune classe"
              placeholder="Choisir l'enseignant"
              data={fichesEnseignants(utilisateurEnEdition?.personnelId)}
              value={personnelIdEdition}
              onChange={setPersonnelIdEdition}
              searchable
              nothingFoundMessage="Aucun enseignant sans compte"
            />
          )}
          <PasswordInput
            label="Nouveau mot de passe (optionnel)"
            description="Laisser vide pour conserver le mot de passe actuel"
            value={nouveauMotDePasse}
            onChange={(e) => setNouveauMotDePasse(e.currentTarget.value)}
          />
          <Button
            disabled={!nomEdition || !prenomEdition || !emailEdition || !roleEdition || (roleEdition === 'ENSEIGNANT' && !personnelIdEdition)}
            loading={editionMutation.isPending}
            onClick={() => editionMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
