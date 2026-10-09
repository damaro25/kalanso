import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Modal, SegmentedControl, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconEye } from '@tabler/icons-react';
import { payerInscription, type TypeInscription } from '../../api/payerInscription';
import { ouvrirRecu } from '../../api/finances';

const MODES = [
  { value: 'ESPECES', label: 'Espèces' },
  { value: 'VIREMENT', label: 'Virement' },
  { value: 'CHEQUE', label: 'Chèque' },
  { value: 'AUTRE', label: 'Autre' },
];

const LIBELLES: Record<TypeInscription, string> = { INSCRIPTION: 'Inscription', REINSCRIPTION: 'Réinscription' };

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

export interface InscriptionAPayer {
  eleveId: string;
  nomComplet?: string;
  type: TypeInscription; // type détecté, ou celui de la facture déjà générée
  typeModifiable: boolean; // faux dès qu'un versement a été enregistré sur la facture
  reste: number; // à payer pour le type ci-dessus
  montants: { INSCRIPTION: number; REINSCRIPTION: number }; // frais du niveau pour chaque type
  classe: string;
  niveau: string;
  anneeLibelle: string;
}

// Fenêtre de paiement de l'inscription / de la réinscription : le montant n'est pas saisi, c'est celui des
// frais du niveau de la classe pour le type d'opération choisi. On choisit le type (inscription ou
// réinscription, tant qu'aucun versement n'a été fait) et le mode de paiement, puis on peut ouvrir le reçu.
// Utilisée par la fiche élève et par la page « Paiement inscription/réinscription ».
export function PayerInscriptionModal({
  opened,
  onClose,
  inscription,
}: {
  opened: boolean;
  onClose: () => void;
  inscription: InscriptionAPayer | null;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<string | null>('ESPECES');
  const [type, setType] = useState<TypeInscription>('INSCRIPTION');
  const [dernierRecu, setDernierRecu] = useState<string | null>(null);

  // À chaque ouverture, on repart du type détecté pour cet élève.
  useEffect(() => {
    if (opened && inscription) setType(inscription.type);
  }, [opened, inscription?.eleveId, inscription?.type]);

  // Même type que celui de la facture : son reste ; autre type : le frais du niveau pour ce type.
  const montant = inscription ? (type === inscription.type ? inscription.reste : inscription.montants[type]) : 0;

  const paiement = useMutation({
    mutationFn: () => payerInscription(inscription!.eleveId, mode ?? undefined, inscription!.typeModifiable ? type : undefined),
    onSuccess: (r) => {
      for (const cle of [
        'inscriptions-a-payer',
        'apercu-inscription',
        'eleve-fiche',
        'factures-impayes',
        'bordereau-journalier',
        'dashboard-stats-paiements',
        'finance-dashboard',
        'finance-tresorerie',
        'dashboard-tresorerie',
        'finance-cr',
      ]) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      setDernierRecu(r.paiement.id);
      notifications.show({ message: `${LIBELLES[r.type]} payée : ${fmt(r.montant)} GNF`, color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors du paiement', color: 'red' }),
  });

  function fermer() {
    setDernierRecu(null);
    onClose();
  }

  if (!inscription) return null;

  return (
    <Modal opened={opened} onClose={fermer} title={type === 'REINSCRIPTION' ? 'Payer la réinscription' : "Payer l'inscription"}>
      <Stack>
        {inscription.nomComplet && <Text fw={600}>{inscription.nomComplet}</Text>}

        {!dernierRecu && (
          <div>
            <Text size="sm" fw={500} mb={4}>
              Type d'opération
            </Text>
            <SegmentedControl
              fullWidth
              value={type}
              onChange={(v) => setType(v as TypeInscription)}
              disabled={!inscription.typeModifiable}
              data={[
                { value: 'INSCRIPTION', label: 'Inscription' },
                { value: 'REINSCRIPTION', label: 'Réinscription' },
              ]}
            />
            {!inscription.typeModifiable && (
              <Text size="xs" c="dimmed" mt={4}>
                Un versement a déjà été enregistré : le type ne peut plus être changé.
              </Text>
            )}
          </div>
        )}

        <div>
          <Text size="sm" c="dimmed">
            Montant (frais du niveau {inscription.niveau})
          </Text>
          <Text fw={700} size="xl" c={montant > 0 ? undefined : 'red'}>
            {fmt(montant)} GNF
          </Text>
          <Text size="sm" c="dimmed">
            {LIBELLES[type]}, classe {inscription.classe}, année {inscription.anneeLibelle}
          </Text>
          {montant <= 0 && (
            <Text size="sm" c="red">
              Aucun frais défini pour ce type dans le niveau {inscription.niveau} (page Tarifs).
            </Text>
          )}
        </div>

        {!dernierRecu && <Select label="Mode de paiement" data={MODES} value={mode} onChange={setMode} allowDeselect={false} />}
        {!dernierRecu && (
          <Button loading={paiement.isPending} disabled={montant <= 0} onClick={() => paiement.mutate()}>
            Confirmer le paiement
          </Button>
        )}
        {dernierRecu && (
          <>
            <Badge color="green" size="lg" variant="light">
              Paiement enregistré
            </Badge>
            <Button variant="light" leftSection={<IconEye size={16} stroke={1.5} />} onClick={() => ouvrirRecu(dernierRecu)}>
              Voir le reçu
            </Button>
            <Button variant="subtle" onClick={fermer}>
              Fermer
            </Button>
          </>
        )}
      </Stack>
    </Modal>
  );
}
