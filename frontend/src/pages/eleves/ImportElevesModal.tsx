import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Badge, Button, Group, List, Modal, Stack, Table, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconDownload, IconUpload } from '@tabler/icons-react';
import {
  apercuImportEleves,
  importerEleves,
  telechargerModeleImportEleves,
  type ApercuImportEleves,
  type ResultatImportEleves,
} from '../../api/elevesImport';
import { libelleRegime } from '../../api/finances';

const ACTIONS = {
  CREER: { libelle: 'Nouveau', couleur: 'green' },
  METTRE_A_JOUR: { libelle: 'Mise à jour', couleur: 'blue' },
  ERREUR: { libelle: 'Erreur', couleur: 'red' },
} as const;

const messageErreur = (e: any, defaut: string) => e?.response?.data?.message ?? defaut;

// Import en trois temps : choisir le fichier, vérifier l'aperçu (rien n'est encore enregistré), confirmer.
export function ImportElevesModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [fichier, setFichier] = useState<File | null>(null);
  const [apercu, setApercu] = useState<ApercuImportEleves | null>(null);
  const [resultat, setResultat] = useState<ResultatImportEleves | null>(null);

  const apercuMutation = useMutation({
    mutationFn: apercuImportEleves,
    onSuccess: setApercu,
    onError: (e) => notifications.show({ message: messageErreur(e, 'Fichier illisible'), color: 'red' }),
  });

  const importMutation = useMutation({
    mutationFn: importerEleves,
    onSuccess: (r) => {
      setResultat(r);
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      notifications.show({
        message: `${r.crees} élève(s) créé(s), ${r.misAJour} mis à jour${r.erreurs.length ? `, ${r.erreurs.length} ligne(s) ignorée(s)` : ''}`,
        color: r.erreurs.length ? 'orange' : 'green',
      });
    },
    onError: (e) => notifications.show({ message: messageErreur(e, "Erreur lors de l'import"), color: 'red' }),
  });

  function fermer() {
    setFichier(null);
    setApercu(null);
    setResultat(null);
    onClose();
  }

  function choisir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    setFichier(f);
    setApercu(null);
    setResultat(null);
    apercuMutation.mutate(f);
  }

  const aEnregistrer = apercu ? apercu.aCreer + apercu.aMettreAJour : 0;

  return (
    <Modal opened={opened} onClose={fermer} title="Importer des élèves (Excel)" size="xl">
      <Stack>
        <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={choisir} />

        {!resultat && (
          <>
            <Text size="sm">
              Remplissez le modèle (ou un export de la liste, corrigé), puis choisissez le fichier. Un aperçu s'affiche avant
              tout enregistrement. Un élève déjà présent (même matricule, ou même nom et prénom) est mis à jour au lieu
              d'être recréé.
            </Text>
            <Group>
              <Button variant="default" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerModeleImportEleves()}>
                Télécharger le modèle
              </Button>
              <Button
                variant="light"
                leftSection={<IconUpload size={16} stroke={1.5} />}
                loading={apercuMutation.isPending}
                onClick={() => inputRef.current?.click()}
              >
                {fichier ? 'Choisir un autre fichier' : 'Choisir le fichier'}
              </Button>
              {fichier && <Text size="sm" c="dimmed">{fichier.name}</Text>}
            </Group>
          </>
        )}

        {apercu && !resultat && (
          <>
            <Group gap="xs">
              <Badge color="green" variant="light">{apercu.aCreer} nouveau(x)</Badge>
              <Badge color="blue" variant="light">{apercu.aMettreAJour} mise(s) à jour</Badge>
              <Badge color="red" variant="light">{apercu.enErreur} en erreur</Badge>
            </Group>
            {(apercu.niveauxACreer.length > 0 || apercu.classesACreer.length > 0) && (
              <Alert color="blue" variant="light">
                {apercu.niveauxACreer.length > 0 && <Text size="sm">Niveaux qui seront créés : {apercu.niveauxACreer.join(', ')}</Text>}
                {apercu.classesACreer.length > 0 && <Text size="sm">Classes qui seront créées : {apercu.classesACreer.join(', ')}</Text>}
              </Alert>
            )}
            {apercu.colonnesIgnorees.length > 0 && (
              <Text size="xs" c="dimmed">Colonnes non reconnues, ignorées : {apercu.colonnesIgnorees.join(', ')}</Text>
            )}
            {apercu.enErreur > 0 && (
              <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
                Les lignes en erreur ne seront pas importées. Corrigez-les dans le fichier puis choisissez-le à nouveau, ou
                importez seulement les lignes valides.
              </Alert>
            )}
            <Table.ScrollContainer minWidth={640} mah={360}>
              <Table striped stickyHeader>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Ligne</Table.Th>
                    <Table.Th>Élève</Table.Th>
                    <Table.Th>Matricule</Table.Th>
                    <Table.Th>Classe</Table.Th>
                    <Table.Th>Action</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {apercu.lignes.map((l) => (
                    <Table.Tr key={l.ligne}>
                      <Table.Td>{l.ligne}</Table.Td>
                      <Table.Td>
                        {l.nomComplet || '—'}
                        {l.erreurs.length > 0 && (
                          <Text size="xs" c="red">{l.erreurs.join(' ; ')}</Text>
                        )}
                      </Table.Td>
                      <Table.Td>{l.matricule || '—'}</Table.Td>
                      <Table.Td>
                        {l.classe || '—'}
                        {l.regime && <Text size="xs" c="dimmed">{libelleRegime(l.regime)}</Text>}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={ACTIONS[l.action].couleur} variant="light">{ACTIONS[l.action].libelle}</Badge>
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
            <Text size="xs" c="dimmed">
              Les élèves avec une classe y sont inscrits et leurs frais d'inscription et d'écolage sont facturés, comme pour une
              admission.
            </Text>
            <Group justify="flex-end">
              <Button variant="default" onClick={fermer}>Annuler</Button>
              <Button disabled={aEnregistrer === 0} loading={importMutation.isPending} onClick={() => fichier && importMutation.mutate(fichier)}>
                Importer {aEnregistrer} élève(s)
              </Button>
            </Group>
          </>
        )}

        {resultat && (
          <>
            <Text>
              <b>{resultat.crees}</b> élève(s) créé(s) et <b>{resultat.misAJour}</b> mis à jour.
            </Text>
            {resultat.niveauxCrees.length > 0 && <Text size="sm">Niveaux créés : {resultat.niveauxCrees.join(', ')}</Text>}
            {resultat.classesCrees.length > 0 && <Text size="sm">Classes créées : {resultat.classesCrees.join(', ')}</Text>}
            {resultat.erreurs.length > 0 && (
              <Alert color="orange" title={`${resultat.erreurs.length} ligne(s) non importée(s)`} icon={<IconAlertTriangle size={16} />}>
                <List size="sm">
                  {resultat.erreurs.map((e) => (
                    <List.Item key={e.ligne}>Ligne {e.ligne} : {e.motif}</List.Item>
                  ))}
                </List>
              </Alert>
            )}
            <Group justify="flex-end">
              <Button onClick={fermer}>Fermer</Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}
