import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ActionIcon, Button, FileInput, Group, Paper, Select, Stack, Text, Tooltip } from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconEye, IconPlus, IconReplace, IconTrash } from '@tabler/icons-react';
import { TYPES_DOCUMENT, type DocumentDemande, type TypeDocument } from '../../api/admissions';
import {
  ajouterDocumentEleve,
  fetchDocumentsEleve,
  modifierDocumentEleve,
  ouvrirDocumentEleve,
  supprimerDocumentEleve,
} from '../../api/elevesDocuments';

const FORMATS = '.pdf,.jpg,.jpeg,.png,.gif,.webp,.heic,.doc,.docx';
const erreur = (e: any, defaut: string) => notifications.show({ message: e?.response?.data?.message ?? defaut, color: 'red' });
const taille = (o: number) => (o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1)} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

// Section « Dossier » de la fenêtre « Modifier » : pièces de l'élève, enregistrées dès qu'on les ajoute,
// change le type, remplace le fichier ou supprime une pièce.
export function DossierEleve({ eleveId }: { eleveId: string }) {
  const queryClient = useQueryClient();
  const cle = ['eleve-documents', eleveId];
  const { data: documents } = useQuery({ queryKey: cle, queryFn: () => fetchDocumentsEleve(eleveId) });
  const [type, setType] = useState<string | null>('EXTRAIT_NAISSANCE');
  const [fichier, setFichier] = useState<File | null>(null);
  const remplacement = useRef<{ input: HTMLInputElement | null; document: DocumentDemande | null }>({ input: null, document: null });

  const rafraichir = () => queryClient.invalidateQueries({ queryKey: cle });

  const ajouter = useMutation({
    mutationFn: () => ajouterDocumentEleve(eleveId, type as TypeDocument, fichier!),
    onSuccess: () => {
      rafraichir();
      setFichier(null);
      notifications.show({ message: 'Pièce ajoutée au dossier', color: 'green' });
    },
    onError: (e) => erreur(e, "Erreur lors de l'ajout"),
  });
  const modifier = useMutation({
    mutationFn: (v: { id: string; type?: TypeDocument; fichier?: File }) => modifierDocumentEleve(eleveId, v.id, v),
    onSuccess: (_d, v) => {
      rafraichir();
      notifications.show({ message: v.fichier ? 'Fichier remplacé' : 'Pièce modifiée', color: 'green' });
    },
    onError: (e) => erreur(e, 'Erreur lors de la modification'),
  });
  const supprimer = useMutation({
    mutationFn: (id: string) => supprimerDocumentEleve(eleveId, id),
    onSuccess: () => {
      rafraichir();
      notifications.show({ message: 'Pièce supprimée', color: 'green' });
    },
    onError: (e) => erreur(e, 'Erreur lors de la suppression'),
  });

  function confirmerSuppression(d: DocumentDemande) {
    modals.openConfirmModal({
      title: 'Supprimer la pièce',
      centered: true,
      children: <Text size="sm">Supprimer définitivement « {d.nomFichier} » du dossier ?</Text>,
      labels: { confirm: 'Supprimer', cancel: 'Annuler' },
      confirmProps: { color: 'red' },
      onConfirm: () => supprimer.mutate(d.id),
    });
  }

  function choisirRemplacement(d: DocumentDemande) {
    remplacement.current.document = d;
    remplacement.current.input?.click();
  }

  return (
    <Stack gap="xs">
      <input
        ref={(el) => {
          remplacement.current.input = el;
        }}
        type="file"
        accept={FORMATS}
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          const d = remplacement.current.document;
          if (f && d) modifier.mutate({ id: d.id, fichier: f });
        }}
      />
      {documents?.length === 0 && (
        <Text size="sm" c="dimmed">
          Aucune pièce dans le dossier.
        </Text>
      )}
      {documents?.map((d) => (
        <Paper key={d.id} withBorder p="xs">
          <Group justify="space-between" wrap="nowrap">
            <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
              <Select
                aria-label="Type de pièce"
                data={TYPES_DOCUMENT}
                value={d.type}
                onChange={(v) => v && v !== d.type && modifier.mutate({ id: d.id, type: v as TypeDocument })}
                allowDeselect={false}
                w={190}
                size="xs"
              />
              <Text size="sm" truncate>
                {d.nomFichier}{' '}
                <Text span size="xs" c="dimmed">
                  ({taille(d.tailleOctets)})
                </Text>
              </Text>
            </Group>
            <Group gap={4} wrap="nowrap">
              <Tooltip label="Voir">
                <ActionIcon variant="subtle" onClick={() => ouvrirDocumentEleve(eleveId, d).catch((e) => erreur(e, 'Fichier introuvable'))}>
                  <IconEye size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Remplacer le fichier">
                <ActionIcon variant="subtle" loading={modifier.isPending && modifier.variables?.id === d.id} onClick={() => choisirRemplacement(d)}>
                  <IconReplace size={16} />
                </ActionIcon>
              </Tooltip>
              <Tooltip label="Supprimer">
                <ActionIcon variant="subtle" color="red" onClick={() => confirmerSuppression(d)}>
                  <IconTrash size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
        </Paper>
      ))}
      <Group align="flex-end" wrap="wrap">
        <Select label="Nouvelle pièce" data={TYPES_DOCUMENT} value={type} onChange={setType} allowDeselect={false} w={{ base: '100%', sm: 190 }} />
        <FileInput
          label="Fichier"
          placeholder="Choisir un fichier"
          accept={FORMATS}
          value={fichier}
          onChange={setFichier}
          clearable
          style={{ flex: 1, minWidth: 200 }}
        />
        <Button leftSection={<IconPlus size={16} />} disabled={!fichier || !type} loading={ajouter.isPending} onClick={() => ajouter.mutate()}>
          Ajouter
        </Button>
      </Group>
      <Text size="xs" c="dimmed">
        PDF, images ou Word, 10 Mo au plus. Les pièces sont enregistrées tout de suite, sans attendre « Enregistrer ».
      </Text>
    </Stack>
  );
}
