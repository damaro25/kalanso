import { modals } from '@mantine/modals';
import type { ReactNode } from 'react';

interface ConfirmerSuppressionOptions {
  titre?: string;
  message: ReactNode;
  onConfirm: () => void;
}

// Boîte de confirmation partagée pour toute action de suppression : les
// utilisateurs de l'appli ne sont pas familiers des outils numériques, un
// clic malheureux sur une liste dense ne doit jamais supprimer une donnée
// sans étape intermédiaire.
export function confirmerSuppression({ titre = 'Confirmer la suppression', message, onConfirm }: ConfirmerSuppressionOptions) {
  modals.openConfirmModal({
    title: titre,
    centered: true,
    children: message,
    labels: { confirm: 'Supprimer', cancel: 'Annuler' },
    confirmProps: { color: 'red' },
    onConfirm,
  });
}
