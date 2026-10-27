import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Group, Modal, PinInput, Stack, Text, Textarea } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { annulerPaiements } from '../../api/finances';

// Annulation d'une opération de l'historique (ou de certains de ses éléments), réservée au fondateur. Le paiement
// reste visible dans l'historique comme annulé ; le reste à payer, les comptes et le reçu de l'opération se
// recalculent. Motif et code à 4 chiffres exigés, vérifiés par le serveur ; un mauvais code laisse la fenêtre ouverte.

export interface OperationPaiement {
  date: string;
  mode: string;
  elements: { id: string; libelle: string; montant: number }[];
}

const fmt = (n: number) => n.toLocaleString('fr-FR');

export function AnnulationPaiementModal({
  eleveId,
  operation,
  onClose,
}: {
  eleveId: string;
  operation: OperationPaiement | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [choisis, setChoisis] = useState<string[]>([]);
  const [motif, setMotif] = useState('');
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    setChoisis(operation?.elements.map((e) => e.id) ?? []);
    setMotif('');
    setCode('');
    setErreur(null);
  }, [operation]);

  const total = (operation?.elements ?? []).filter((e) => choisis.includes(e.id)).reduce((a, e) => a + e.montant, 0);

  const mutation = useMutation({
    mutationFn: () => annulerPaiements(choisis, motif.trim(), code),
    onSuccess: (r) => {
      notifications.show({
        message: `${r.annules} paiement(s) annulé(s) : ${fmt(r.montant)} GNF`,
        color: 'green',
      });
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      queryClient.invalidateQueries({
        queryKey: ['apercu-inscription', eleveId],
      });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClose();
    },
    onError: (e: any) => {
      setErreur(e?.response?.data?.message ?? "Erreur lors de l'annulation");
      setCode('');
    },
  });

  const pret = choisis.length > 0 && motif.trim().length > 0 && code.length === 4;

  function valider(evenement: React.FormEvent) {
    evenement.preventDefault();
    if (pret && !mutation.isPending) mutation.mutate();
  }

  return (
    <Modal opened={!!operation} onClose={onClose} title="Annuler un paiement" centered>
      {operation && (
        <form onSubmit={valider}>
          <Stack>
            <Text size="sm">
              Paiement du <strong>{new Date(operation.date).toLocaleDateString('fr-FR')}</strong> ({operation.mode}) :
            </Text>
            {operation.elements.length > 1 ? (
              <Stack gap={6}>
                {operation.elements.map((e) => (
                  <Checkbox
                    key={e.id}
                    label={`${e.libelle} : ${fmt(e.montant)} GNF`}
                    checked={choisis.includes(e.id)}
                    onChange={(ev) => {
                      const coche = ev.currentTarget.checked;
                      setChoisis((c) => (coche ? [...c, e.id] : c.filter((x) => x !== e.id)));
                    }}
                  />
                ))}
              </Stack>
            ) : (
              <Text size="sm">
                {operation.elements[0].libelle} : {fmt(operation.elements[0].montant)} GNF
              </Text>
            )}
            <Alert color="orange" variant="light">
              {fmt(total)} GNF seront retirés des versements de l'élève : le reste à payer, les comptes et le reçu se recalculent. Le
              paiement reste visible dans l'historique comme annulé, avec le motif.
            </Alert>
            <Textarea
              label="Motif de l'annulation"
              placeholder="Ex. : paiement saisi deux fois, mauvais élève…"
              required
              autosize
              minRows={2}
              maxLength={500}
              value={motif}
              onChange={(e) => setMotif(e.currentTarget.value)}
            />
            <Stack gap={6} align="center">
              <Text size="sm" fw={500}>
                Saisissez le code à 4 chiffres pour confirmer
              </Text>
              <PinInput
                length={4}
                type="number"
                mask
                value={code}
                onChange={(v) => {
                  setCode(v);
                  setErreur(null);
                }}
                error={!!erreur}
                aria-label="Code de confirmation"
              />
              {erreur && (
                <Text size="sm" c="red" role="alert">
                  {erreur}
                </Text>
              )}
            </Stack>
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                Fermer
              </Button>
              <Button type="submit" color="red" disabled={!pret} loading={mutation.isPending}>
                Annuler le paiement
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  );
}
