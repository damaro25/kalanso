import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Group, List, Loader, Modal, PinInput, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { fetchApercuSuppression, supprimerEleve, type Eleve } from '../../api/eleves';

// Suppression définitive d'un élève et de tout ce qui le concerne. La fenêtre montre d'abord ce qui sera supprimé
// (nombres), puis exige le code à 4 chiffres, vérifié par le serveur. Un mauvais code laisse la fenêtre ouverte.

const ELEMENTS: [keyof Awaited<ReturnType<typeof fetchApercuSuppression>>, string][] = [
  ['factures', 'facture(s)'],
  ['paiements', 'paiement(s) et leurs reçus'],
  ['notes', 'note(s) (et donc les bulletins)'],
  ['absences', 'absence(s) ou retard(s)'],
  ['inscriptions', 'inscription(s) en classe'],
  ['formations', 'inscription(s) aux formations'],
  ['emprunts', 'emprunt(s) de livres'],
  ['messages', 'message(s) aux parents'],
  ['demandes', "demande(s) d'admission et leurs documents"],
];
export function SuppressionEleveModal({ eleve, onClose }: { eleve: Eleve | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [code, setCode] = useState('');
  const [erreur, setErreur] = useState<string | null>(null);
  const { data: apercu, isLoading } = useQuery({
    queryKey: ['eleve-suppression', eleve?.id],
    queryFn: () => fetchApercuSuppression(eleve!.id),
    enabled: !!eleve,
    gcTime: 0,
  });

  useEffect(() => {
    setCode('');
    setErreur(null);
  }, [eleve?.id]);

  const mutation = useMutation({
    mutationFn: () => supprimerEleve(eleve!.id, code),
    onSuccess: () => {
      notifications.show({ message: `${eleve!.prenom} ${eleve!.nom} et toutes ses données ont été supprimés`, color: 'green' });
      for (const cle of ['eleves', 'effectifs', 'factures-impayes', 'dashboard', 'eleve-fiche']) queryClient.invalidateQueries({ queryKey: [cle] });
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
    <Modal opened={!!eleve} onClose={onClose} title="Supprimer un élève" centered>
      {eleve && (
        <form onSubmit={valider}>
          <Stack>
            <Text size="sm">
              Supprimer définitivement <strong>{eleve.prenom} {eleve.nom}</strong>
              {eleve.classe ? ` (${eleve.classe.nom})` : ''} et tout ce qui le concerne :
            </Text>
            {isLoading || !apercu ? (
              <Group justify="center">
                <Loader size="sm" />
              </Group>
            ) : (
              <List size="sm">
                {ELEMENTS.filter(([cle]) => apercu[cle] > 0).map(([cle, libelle]) => (
                  <List.Item key={cle}>
                    {apercu[cle]} {libelle}
                  </List.Item>
                ))}
                <List.Item>sa fiche, ses parents (sauf s'ils ont un autre enfant à l'école) et sa photo</List.Item>
              </List>
            )}
            <Alert color="red" variant="light">
              Cette suppression est définitive : rien ne pourra être récupéré, et les paiements disparaissent aussi du
              bordereau et des comptes.
            </Alert>
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
