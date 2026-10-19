import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, List, Modal, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconUpload } from '@tabler/icons-react';
import { apercuImportGrille, importerGrille, telechargerGrille, type ApercuImportGrille, type Grille } from '../../api/configuration';

const ACTIONS = {
  CREE: { libelle: 'Nouveau niveau', couleur: 'green' },
  MODIFIE: { libelle: 'Modifié', couleur: 'blue' },
  INCHANGE: { libelle: 'Inchangé', couleur: 'gray' },
  ERREUR: { libelle: 'Erreur', couleur: 'red' },
} as const;

// Import de la grille tarifaire : choisir le fichier, lire l'aperçu des changements (rien n'est enregistré),
// confirmer. La grille actuelle est d'abord téléchargée en sauvegarde.
export function ImportGrilleModal({
  opened,
  onClose,
  anneeScolaireId,
  libelleAnnee,
  onImportee,
}: {
  opened: boolean;
  onClose: () => void;
  anneeScolaireId: string;
  libelleAnnee: string;
  onImportee: (grille: Grille) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<ApercuImportGrille | null>(null);

  const apercuMutation = useMutation({
    mutationFn: (f: File) => apercuImportGrille(anneeScolaireId, f),
    onSuccess: setApercu,
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Fichier illisible', color: 'red' }),
  });

  const importMutation = useMutation({
    mutationFn: async () => {
      // Sauvegarde de la grille actuelle avant de la remplacer
      await telechargerGrille(anneeScolaireId, `sauvegarde-grille-${libelleAnnee}.xlsx`);
      return importerGrille(anneeScolaireId, fichier!);
    },
    onSuccess: (r) => {
      onImportee(r.grille);
      notifications.show({
        message: `Grille importée : ${r.niveauxModifies} niveau(x) modifié(s)${r.niveauxCrees.length ? `, niveau(x) créé(s) : ${r.niveauxCrees.join(', ')}` : ''}. La grille précédente a été téléchargée en sauvegarde.`,
        color: 'green',
      });
      fermer();
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'import", color: 'red' }),
  });

  function fermer() {
    setFichier(null);
    setApercu(null);
    onClose();
  }

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFichier(f);
    setApercu(null);
    apercuMutation.mutate(f);
  }

  const erreurs = apercu ? apercu.enErreur + apercu.echeances.erreurs.length : 0;
  const changements = apercu ? apercu.aModifier + apercu.niveauxACreer.length + apercu.echeances.changements.length : 0;

  return (
    <Modal opened={opened} onClose={fermer} title={`Importer la grille tarifaire ${libelleAnnee}`} size="xl">
      <Stack>
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={choisir} />
        <Text size="sm">
          Partez de l'export de la grille (bouton « Exporter »), modifiez les montants dans Excel puis choisissez le fichier. Les
          changements s'affichent avant tout enregistrement.
        </Text>
        <Group>
          <Button
            variant="light"
            leftSection={<IconUpload size={16} stroke={1.5} />}
            loading={apercuMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {fichier ? 'Choisir un autre fichier' : 'Choisir le fichier'}
          </Button>
          {fichier && (
            <Text size="sm" c="dimmed">
              {fichier.name}
            </Text>
          )}
        </Group>

        {apercu && (
          <>
            {erreurs > 0 && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />}>
                Le fichier contient {erreurs} erreur(s) : corrigez-les puis choisissez à nouveau le fichier. Rien ne sera importé
                tant qu'il reste une erreur.
              </Alert>
            )}
            {(apercu.echeances.changements.length > 0 || apercu.echeances.erreurs.length > 0) && (
              <List size="sm">
                {apercu.echeances.changements.map((c) => (
                  <List.Item key={c}>{c}</List.Item>
                ))}
                {apercu.echeances.erreurs.map((c) => (
                  <List.Item key={c}>
                    <Text size="sm" c="red">
                      {c}
                    </Text>
                  </List.Item>
                ))}
              </List>
            )}
            <Table.ScrollContainer minWidth={560} mah={360}>
              <Table striped stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Niveau</Table.Th>
                    <Table.Th>Changements</Table.Th>
                    <Table.Th>État</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {apercu.lignes.map((l) => (
                    <Table.Tr key={l.ligne}>
                      <Table.Td>{l.niveau}</Table.Td>
                      <Table.Td>
                        {l.changements.length + l.erreurs.length === 0 && (
                          <Text size="sm" c="dimmed">
                            —
                          </Text>
                        )}
                        {l.changements.map((c) => (
                          <Text key={c} size="sm">
                            {c}
                          </Text>
                        ))}
                        {l.erreurs.map((c) => (
                          <Text key={c} size="sm" c="red">
                            {c}
                          </Text>
                        ))}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ACTIONS[l.action].couleur} variant="light">
                          {ACTIONS[l.action].libelle}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            {apercu.niveauxACreer.length > 0 && (
              <Text size="sm" c="green">
                Niveaux qui seront créés : {apercu.niveauxACreer.join(', ')}
              </Text>
            )}
            {apercu.niveauxAbsents.length > 0 && (
              <Text size="xs" c="dimmed">
                Absents du fichier, inchangés : {apercu.niveauxAbsents.join(', ')}
              </Text>
            )}
            <Text size="xs" c="dimmed">
              Les factures déjà émises ne changent pas. La grille actuelle sera téléchargée en sauvegarde avant l'import.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={fermer}>
                Annuler
              </Button>
              <Button disabled={erreurs > 0 || changements === 0} loading={importMutation.isPending} onClick={() => importMutation.mutate()}>
                {changements === 0 ? 'Aucun changement' : 'Importer la grille'}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
