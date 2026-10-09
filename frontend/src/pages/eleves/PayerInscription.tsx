import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Anchor, Badge, Button, Group, Paper, Text, Title } from '@mantine/core';
import { IconCash } from '@tabler/icons-react';
import { fetchApercuInscription } from '../../api/payerInscription';
import { useAuth } from '../../auth/AuthContext';
import { PayerInscriptionModal } from './PayerInscriptionModal';

// Mêmes rôles que l'API des paiements : les autres n'ont pas accès à l'encaissement.
const ROLES_ENCAISSEMENT = ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'];

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// Paiement de l'inscription ou de la réinscription d'un élève : l'admission ne l'encaisse plus, on le
// règle ici (ou depuis la page « Paiement inscription/réinscription »), au montant exact des frais du niveau de sa classe.
export function PayerInscription({ eleveId, aUneClasse }: { eleveId: string; aUneClasse: boolean }) {
  const { user } = useAuth();
  const autorise = !!user && ROLES_ENCAISSEMENT.includes(user.role);
  const [ouvert, setOuvert] = useState(false);

  const { data: apercu } = useQuery({
    queryKey: ['apercu-inscription', eleveId],
    queryFn: () => fetchApercuInscription(eleveId),
    enabled: autorise && aUneClasse,
    retry: false,
  });

  if (!autorise || !aUneClasse || !apercu) return null;

  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        Inscription / réinscription
      </Title>

      {apercu.etat === 'PAYEE' && (
        <Group>
          <Badge color="green" size="lg" variant="light">
            {apercu.libelle} payée
          </Badge>
          <Text size="sm" c="dimmed">
            {fmt(apercu.montant)} GNF, année {apercu.anneeScolaire.libelle}
          </Text>
        </Group>
      )}

      {apercu.etat === 'FRAIS_NON_DEFINIS' && (
        <Text size="sm" c="dimmed">
          Aucun frais d'inscription n'est défini pour le niveau {apercu.niveau}. Renseignez-le dans la page{' '}
          <Anchor component={Link} to="/finances/tarifs" size="sm">
            Tarifs
          </Anchor>
          .
        </Text>
      )}

      {apercu.etat === 'A_PAYER' && (
        <Group justify="space-between">
          <div>
            <Text fw={600}>
              {apercu.libelle} : {fmt(apercu.reste)} GNF
            </Text>
            <Text size="sm" c="dimmed">
              Classe {apercu.classe} ({apercu.niveau}), année {apercu.anneeScolaire.libelle}
              {apercu.dejaPaye > 0 ? `, déjà versé ${fmt(apercu.dejaPaye)} GNF` : ''}
            </Text>
          </div>
          <Button leftSection={<IconCash size={16} stroke={1.5} />} onClick={() => setOuvert(true)}>
            {apercu.type === 'REINSCRIPTION' ? 'Payer la réinscription' : "Payer l'inscription"}
          </Button>
        </Group>
      )}

      <PayerInscriptionModal
        opened={ouvert}
        onClose={() => setOuvert(false)}
        inscription={{
          eleveId,
          type: apercu.type,
          typeModifiable: apercu.typeModifiable,
          montants: apercu.montants,
          reste: apercu.reste,
          classe: apercu.classe,
          niveau: apercu.niveau,
          anneeLibelle: apercu.anneeScolaire.libelle,
        }}
      />
    </Paper>
  );
}
