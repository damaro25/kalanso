import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useMemo, useRef, useState } from 'react';
import { Table, Title, Badge, Button, Group, Modal, NumberInput, Select, Stack, Text, TextInput, List } from '@mantine/core';
import { IconSearch, IconEye, IconUpload, IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  fetchImpayes,
  createPaiement,
  ouvrirRecu,
  ouvrirFacturePdf,
  importFactures,
  telechargerFactures,
  telechargerModeleFactures,
  type Facture,
  type ImportResultat,
} from '../../api/finances';
import { envoyerRappelImpaye } from '../../api/communication';
import { initierTransaction, confirmerTransaction, echecTransaction, OPERATEURS, type OperateurMobileMoney } from '../../api/mobileMoney';
import { correspond } from '../../lib/search';

const STATUT_COLORS: Record<string, string> = {
  IMPAYEE: 'red',
  PARTIELLE: 'yellow',
  PAYEE: 'green',
  ANNULEE: 'gray',
};

export function FacturesListPage() {
  const queryClient = useQueryClient();
  const { data: factures, isLoading } = useQuery({ queryKey: ['factures-impayes'], queryFn: fetchImpayes });
  const [recherche, setRecherche] = useState('');

  const facturesFiltrees = useMemo(
    () => (factures ?? []).filter((f) => correspond([f.eleve.nom, f.eleve.prenom, f.libelle], recherche)),
    [factures, recherche],
  );

  const [factureId, setFactureId] = useState<string | null>(null);
  const [montant, setMontant] = useState<number | ''>('');
  const [mode, setMode] = useState<string | null>('ESPECES');
  const [dernierPaiementId, setDernierPaiementId] = useState<string | null>(null);

  // Mobile Money
  const [factureMM, setFactureMM] = useState<Facture | null>(null);
  const [operateur, setOperateur] = useState<string | null>('ORANGE_MONEY');
  const [telephoneMM, setTelephoneMM] = useState('');
  const [montantMM, setMontantMM] = useState<number | ''>('');
  const [transactionEnCours, setTransactionEnCours] = useState<{ id: string; reference: string } | null>(null);

  const rappelMutation = useMutation({
    mutationFn: (id: string) => envoyerRappelImpaye(id),
    onSuccess: () => notifications.show({ message: 'Rappel SMS envoyé aux parents', color: 'green' }),
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Erreur lors de l'envoi du rappel";
      notifications.show({ message, color: 'red' });
    },
  });

  const mutation = useMutation({
    mutationFn: () => createPaiement({ factureId: factureId!, montant: Number(montant), mode: mode as any }),
    onSuccess: (paiement) => {
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: 'Paiement enregistré', color: 'green' });
      setDernierPaiementId(paiement.id);
      setMontant('');
    },
    onError: () => notifications.show({ message: "Erreur lors de l'enregistrement du paiement", color: 'red' }),
  });

  function ouvrirModalMM(f: Facture) {
    setFactureMM(f);
    setOperateur('ORANGE_MONEY');
    setTelephoneMM('');
    setMontantMM(Number(f.montantTotal) - Number(f.montantPaye));
    setTransactionEnCours(null);
  }

  const initierMutation = useMutation({
    mutationFn: () =>
      initierTransaction({
        factureId: factureMM!.id,
        operateur: operateur as OperateurMobileMoney,
        telephone: telephoneMM,
        montant: Number(montantMM),
      }),
    onSuccess: (txn) => {
      setTransactionEnCours({ id: txn.id, reference: txn.reference });
      notifications.show({ message: `Demande envoyée au ${telephoneMM} (réf ${txn.reference})`, color: 'blue' });
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? "Erreur lors de l'initiation";
      notifications.show({ message, color: 'red' });
    },
  });

  const confirmerMutation = useMutation({
    mutationFn: () => confirmerTransaction(transactionEnCours!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: 'Paiement Mobile Money confirmé', color: 'green' });
      setFactureMM(null);
    },
    onError: (error: any) => {
      const message = error?.response?.data?.message ?? 'Erreur lors de la confirmation';
      notifications.show({ message, color: 'red' });
    },
  });

  const echecMutation = useMutation({
    mutationFn: () => echecTransaction(transactionEnCours!.id),
    onSuccess: () => {
      notifications.show({ message: 'Transaction marquée comme échouée', color: 'orange' });
      setFactureMM(null);
    },
  });

  // Import Excel
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resultatImport, setResultatImport] = useState<ImportResultat | null>(null);

  const importMutation = useMutation({
    mutationFn: (fichier: File) => importFactures(fichier),
    onSuccess: (resultat) => {
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({
        message: `${resultat.creees} facture(s) créée(s)${resultat.erreurs.length > 0 ? `, ${resultat.erreurs.length} ligne(s) ignorée(s)` : ''}`,
        color: resultat.erreurs.length > 0 ? 'orange' : 'green',
      });
      if (resultat.erreurs.length > 0) setResultatImport(resultat);
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? "Erreur lors de l'import", color: 'red' });
    },
  });

  function onFichierChoisi(e: React.ChangeEvent<HTMLInputElement>) {
    const fichier = e.target.files?.[0];
    if (fichier) importMutation.mutate(fichier);
    e.target.value = '';
  }

  return (
    <Stack>
      <Title order={2}>Factures impayées</Title>

      <Group>
        <TextInput
          placeholder="Rechercher par élève ou libellé..."
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
          maw={420}
        />
        <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFichierChoisi} />
        <Button
          variant="light"
          leftSection={<IconUpload size={16} stroke={1.5} />}
          loading={importMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          Importer (Excel)
        </Button>
        <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerFactures()}>
          Exporter (Excel)
        </Button>
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconFileSpreadsheet size={16} stroke={1.5} />}
          onClick={() => telechargerModeleFactures()}
        >
          Modèle d'import
        </Button>
      </Group>

      {isLoading && <p>Chargement...</p>}

      {factures && factures.length === 0 && <Text c="dimmed">Aucune facture impayée.</Text>}

      {factures && factures.length > 0 && facturesFiltrees.length === 0 && (
        <Text c="dimmed">Aucune facture ne correspond à « {recherche} ».</Text>
      )}

      {factures && facturesFiltrees.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Élève</Table.Th>
              <Table.Th>Libellé</Table.Th>
              <Table.Th>Total</Table.Th>
              <Table.Th>Payé</Table.Th>
              <Table.Th>Statut</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {facturesFiltrees.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>
                  {f.eleve.prenom} {f.eleve.nom}
                </Table.Td>
                <Table.Td>{f.libelle}</Table.Td>
                <Table.Td>{Number(f.montantTotal).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>{Number(f.montantPaye).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>
                  <Badge color={STATUT_COLORS[f.statut]}>{f.statut}</Badge>
                </Table.Td>
                <Table.Td>
                  <Group gap="xs">
                    <Button size="xs" onClick={() => setFactureId(f.id)}>
                      Encaisser
                    </Button>
                    <Button size="xs" variant="light" leftSection={<IconEye size={14} stroke={1.5} />} onClick={() => ouvrirFacturePdf(f.id)}>
                      Voir la facture
                    </Button>
                    <Button
                      size="xs"
                      variant="light"
                      color="orange"
                      loading={rappelMutation.isPending}
                      onClick={() => rappelMutation.mutate(f.id)}
                    >
                      Rappel SMS
                    </Button>
                    <Button size="xs" variant="light" color="grape" onClick={() => ouvrirModalMM(f)}>
                      Mobile Money
                    </Button>
                  </Group>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!factureId} onClose={() => setFactureId(null)} title="Enregistrer un paiement">
        <Stack>
          <NumberInput label="Montant (GNF)" value={montant} onChange={(v) => setMontant(v === '' ? '' : Number(v))} />
          <Select
            label="Mode de paiement"
            data={[
              { value: 'ESPECES', label: 'Espèces' },
              { value: 'VIREMENT', label: 'Virement' },
              { value: 'CHEQUE', label: 'Chèque' },
              { value: 'AUTRE', label: 'Autre' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Button disabled={!montant} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Enregistrer le paiement
          </Button>
          {dernierPaiementId && (
            <Button variant="light" onClick={() => ouvrirRecu(dernierPaiementId)}>
              Voir le reçu du dernier paiement
            </Button>
          )}
        </Stack>
      </Modal>

      <Modal opened={!!factureMM} onClose={() => setFactureMM(null)} title="Paiement Mobile Money">
        <Stack>
          {factureMM && (
            <Text size="sm" c="dimmed">
              {factureMM.eleve.prenom} {factureMM.eleve.nom} — {factureMM.libelle}
            </Text>
          )}
          {!transactionEnCours ? (
            <>
              <Select label="Opérateur" data={OPERATEURS} value={operateur} onChange={setOperateur} />
              <TextInput
                label="Numéro du parent"
                placeholder="ex: 628112233"
                value={telephoneMM}
                onChange={(e) => setTelephoneMM(e.currentTarget.value)}
              />
              <NumberInput
                label="Montant (GNF)"
                value={montantMM}
                onChange={(v) => setMontantMM(v === '' ? '' : Number(v))}
              />
              <Button
                disabled={!operateur || !telephoneMM || !montantMM}
                loading={initierMutation.isPending}
                onClick={() => initierMutation.mutate()}
              >
                Envoyer la demande de paiement
              </Button>
            </>
          ) : (
            <>
              <Text size="sm">
                Demande envoyée (réf <strong>{transactionEnCours.reference}</strong>). En attente de la
                validation du parent sur son téléphone.
              </Text>
              <Group>
                <Button color="green" loading={confirmerMutation.isPending} onClick={() => confirmerMutation.mutate()}>
                  Simuler la confirmation
                </Button>
                <Button color="red" variant="light" loading={echecMutation.isPending} onClick={() => echecMutation.mutate()}>
                  Simuler l'échec
                </Button>
              </Group>
            </>
          )}
        </Stack>
      </Modal>

      <Modal opened={!!resultatImport} onClose={() => setResultatImport(null)} title="Lignes ignorées lors de l'import">
        <List size="sm">
          {resultatImport?.erreurs.map((e) => (
            <List.Item key={e.ligne}>
              Ligne {e.ligne} : {e.motif}
            </List.Item>
          ))}
        </List>
      </Modal>
    </Stack>
  );
}
