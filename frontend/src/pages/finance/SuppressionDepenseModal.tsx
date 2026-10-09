import { useEffect, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Button, Group, Modal, PinInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { supprimerMouvement, type Mouvement } from '../../api/finance';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// Supprimer une dépense la retire des comptes et de la trésorerie : on exige donc un code à 4 chiffres, vérifié
// par le serveur, en plus de la confirmation. Un mauvais code laisse la fenêtre ouverte pour un nouvel essai.
export function SuppressionDepenseModal({
  depense,
  onClose,
  onSupprimee,
}: {
  depense: Mouvement | null;
  onClose: () => void;
  onSupprimee: () => void;
}) {
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setCode('');
    setErreur(null);
  }, [depense?.id]);

  const mutation = useMutation({
    mutationFn: () => supprimerMouvement(depense!.id, code),
    onSuccess: () => {
      notifications.show({ message: 'Dépense supprimée', color: 'green' });
      onSupprimee();
      onClose();
    },
    onError: (e: any) => {
      setErreur(e?.response?.data?.message ?? 'Erreur lors de la suppression');
      setCode('');
    },
  });

  function valider(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (code.length === 4 && !mutation.isPending) mutation.mutate();
  }

  return (
    <Modal opened={!!depense} onClose={onClose} title="Supprimer une dépense" centered>
      {depense && (
        <form onSubmit={valider}>
          <Stack>
            <Text size="sm">
              Voulez-vous vraiment supprimer la dépense « {depense.libelle} » ({fmt(Number(depense.montant))} GNF) ? Cette
              action est définitive.
            </Text>
            <Stack gap={6} align="center">
              <Text size="sm" fw={500}>
                Saisissez le code à 4 chiffres pour confirmer
              </Text>
              <PinInput
                length={4}
                type="number"
                mask
                autoFocus
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setErreur(null);
                }}
                error={!!erreur}
                aria-label="Code de suppression"
              />
              {erreur && (
                <Text size="sm" c="red" role="alert">
                  {erreur}
                </Text>
              )}
            </Stack>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Annuler
              </Button>
              <Button type="submit" color="red" disabled={code.length !== 4} loading={mutation.isPending}>
                Supprimer
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
