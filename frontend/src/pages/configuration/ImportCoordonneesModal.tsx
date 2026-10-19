import { useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Alert, Button, Group, List, Modal, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconUpload } from '@tabler/icons-react';
import { apercuImportCoordonnees, importerCoordonnees, type ApercuImportEcole, type EcoleConfiguration } from '../../api/configuration';

// Import des coordonnées de l'école : choisir le fichier (un export modifié), lire les changements, confirmer.
export function ImportCoordonneesModal({
  opened,
  onClose,
  onImporte,
}: {
  opened: boolean;
  onClose: () => void;
  onImporte: (ecole: EcoleConfiguration) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<ApercuImportEcole | null>(null);

  const apercuMutation = useMutation({
    mutationFn: apercuImportCoordonnees,
    onSuccess: setApercu,
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Fichier illisible', color: 'red' }),
  });
  const importMutation = useMutation({
    mutationFn: () => importerCoordonnees(fichier!),
    onSuccess: (r) => {
      onImporte(r.ecole);
      notifications.show({ message: `Coordonnées importées : ${r.modifies} champ(s) modifié(s)`, color: 'green' });
      fermer();
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'import", color: 'red' }),
  });

  function fermer() {
    setFichier(null);
    setApercu(null);
    onClose();
  }

  return (
    <Modal opened={opened} onClose={fermer} title="Importer les coordonnées de l'école" size="lg">
      <Stack>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            setFichier(f);
            setApercu(null);
            apercuMutation.mutate(f);
          }}
        />
        <Text size="sm">
          Partez de l'export (bouton « Exporter »), modifiez la colonne « Valeur » dans Excel puis choisissez le fichier. Les
          changements s'affichent avant tout enregistrement.
        </Text>
        <Group>
          <Button variant="light" leftSection={<IconUpload size={16} stroke={1.5} />} loading={apercuMutation.isPending} onClick={() => inputRef.current?.click()}>
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
            {apercu.erreurs.length > 0 && (
              <Alert color="red" icon={<IconAlertTriangle size={16} />} title="À corriger avant l'import">
                <List size="sm">
                  {apercu.erreurs.map((e) => (
                    <List.Item key={e}>{e}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            {apercu.changements.length === 0 && apercu.erreurs.length === 0 && <Text c="dimmed">Aucun changement par rapport aux coordonnées actuelles.</Text>}
            {apercu.changements.length > 0 && (
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Champ</Table.Th>
                    <Table.Th>Actuel</Table.Th>
                    <Table.Th>Nouveau</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {apercu.changements.map((c) => (
                    <Table.Tr key={c.champ}>
                      <Table.Td>{c.champ}</Table.Td>
                      <Table.Td c="dimmed">{c.avant || '—'}</Table.Td>
                      <Table.Td fw={600}>{c.apres || '(vide)'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            )}
            {apercu.champsIgnores.length > 0 && (
              <Text size="xs" c="dimmed">
                Lignes non reconnues, ignorées : {apercu.champsIgnores.join(', ')}
              </Text>
            )}
            <Group justify="flex-end">
              <Button variant="default" onClick={fermer}>
                Annuler
              </Button>
              <Button
                disabled={apercu.erreurs.length > 0 || apercu.changements.length === 0}
                loading={importMutation.isPending}
                onClick={() => importMutation.mutate()}
              >
                Importer
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
