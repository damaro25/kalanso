import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Button, Divider, Group, Modal, NumberInput, SegmentedControl, Select, Stack, Text, Tooltip } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createPaiement, ouvrirRecu } from '../../api/finances';
import { changerTypeInscription, fetchApercuInscription, type TypeInscription } from '../../api/payerInscription';
import { usePendingIds } from '../../offline/outbox';

export const resteFacture = (f: any) => Math.max(0, Number(f.montantTotal) - Number(f.montantPaye));
const fmt = (n: number) => n.toLocaleString('fr-FR');
const numeroTranche = (f: any) => Number(/Tranche\s*(\d+)/i.exec(f.libelle ?? '')?.[1] ?? 99);
const parEcheance = (a: any, b: any) =>
  (a.dateEcheance ? new Date(a.dateEcheance).getTime() : Infinity) - (b.dateEcheance ? new Date(b.dateEcheance).getTime() : Infinity) ||
  numeroTranche(a) - numeroTranche(b);
const impayee = (f: any) => (f.statut === 'IMPAYEE' || f.statut === 'PARTIELLE') && resteFacture(f) > 0;

// Ce qui reste à payer pour l'élève, ligne par ligne : inscription, assurance, la tranche d'écolage payable (la
// suivante seulement quand la précédente est soldée), puis les autres factures impayées.
export function lignesAPayer(factures: any[]) {
  const deType = (type: string) => factures.filter((f) => f.type === type && impayee(f)).sort(parEcheance);
  const tranches = deType('ECOLAGE');
  return {
    inscription: deType('INSCRIPTION'),
    assurance: deType('ASSURANCE'),
    tranche: tranches[0] as any | undefined,
    tranchesSuivantes: tranches.slice(1),
    autres: factures.filter((f) => !['INSCRIPTION', 'ASSURANCE', 'ECOLAGE'].includes(f.type) && impayee(f)).sort(parEcheance),
  };
}

// Fenêtre « Payer » : un champ de montant par élément dû (inscription ou réinscription, T-shirt, tranche, autres), remplis en même
// temps ; un seul clic enregistre un paiement (et un reçu) par montant saisi.
export function PayerModal({ eleveId, factures, opened, onClose }: { eleveId: string; factures: any[]; opened: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const idsEnAttente = usePendingIds();
  const [montants, setMontants] = useState<Record<string, number | ''>>({});
  const [mode, setMode] = useState<string | null>('ESPECES');
  const [recus, setRecus] = useState<{ id: string; libelle: string; montant: number }[]>([]);
  // Inscription ou réinscription choisie dans la fenêtre (appliquée à la facture seulement à l'enregistrement)
  const [typeChoisi, setTypeChoisi] = useState<TypeInscription | null>(null);

  useEffect(() => {
    if (opened) {
      setMontants({});
      setRecus([]);
      setTypeChoisi(null);
    }
  }, [opened]);

  const l = lignesAPayer(factures);
  const lignes = [...l.inscription, ...l.assurance, ...(l.tranche ? [l.tranche] : []), ...l.autres];

  // Le type d'une facture d'inscription se choisit tant que rien n'y a été versé ; montants du niveau pour chaque type.
  const estReinscription = (f: any) => /r[ée]inscription/i.test(f.libelle ?? '');
  const typeDe = (f: any): TypeInscription => (estReinscription(f) ? 'REINSCRIPTION' : 'INSCRIPTION');
  const inscriptionModifiable = l.inscription.find((f) => Number(f.montantPaye) === 0);
  const { data: apercuInscription } = useQuery({
    queryKey: ['apercu-inscription', eleveId],
    queryFn: () => fetchApercuInscription(eleveId),
    enabled: opened && !!inscriptionModifiable,
    retry: false,
  });
  const typeChange = (f: any) => f.id === inscriptionModifiable?.id && !!typeChoisi && typeChoisi !== typeDe(f);
  const reste = (f: any) => (typeChange(f) ? (apercuInscription?.montants[typeChoisi!] ?? 0) : resteFacture(f));

  const aEnregistrer = lignes
    .map((f) => ({ facture: f, montant: Number(montants[f.id] || 0) }))
    .filter((x) => x.montant > 0);
  const total = aEnregistrer.reduce((acc, x) => acc + x.montant, 0);
  const depassement = aEnregistrer.find((x) => x.montant > reste(x.facture));

  const mutation = useMutation({
    mutationFn: async () => {
      // Dans l'ordre affiché : inscription, assurance, tranche, autres. Un échec arrête la suite.
      const faits: { id: string; libelle: string; montant: number }[] = [];
      // Plusieurs éléments payés ensemble : une même référence les réunit sur un seul reçu (total, « insc + T-sh + T1 »)
      const reference = aEnregistrer.length > 1 ? `lot:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}` : undefined;
      try {
        for (const { facture, montant } of aEnregistrer) {
          let libelle = facture.libelle;
          if (typeChange(facture)) {
            // La facture prend d'abord le libellé et le montant du type choisi
            await changerTypeInscription(eleveId, typeChoisi!);
            libelle = typeChoisi === 'REINSCRIPTION' ? libelle.replace(/^Frais d'inscription/, 'Frais de réinscription') : libelle.replace(/^Frais de réinscription/, "Frais d'inscription");
          }
          const p = await createPaiement({ factureId: facture.id, montant, mode: mode as any, ...(reference ? { reference } : {}) });
          faits.push({ id: p.id, libelle, montant });
        }
      } catch (e: any) {
        setRecus(faits);
        throw Object.assign(e, { faits });
      }
      return faits;
    },
    onSuccess: (faits) => {
      setRecus(faits);
      setMontants({});
      setTypeChoisi(null);
      notifications.show({ message: `${faits.length} paiement(s) enregistré(s) : ${fmt(faits.reduce((a, f) => a + f.montant, 0))} GNF`, color: 'green' });
    },
    onError: (e: any) => {
      const faits = e?.faits?.length ?? 0;
      notifications.show({
        message: `${faits ? `${faits} paiement(s) enregistré(s), puis ` : ''}${e?.response?.data?.message ?? "erreur lors de l'enregistrement"}`,
        color: 'red',
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      queryClient.invalidateQueries({ queryKey: ['apercu-inscription', eleveId] });
    },
  });

  // Inscription ou réinscription : sélection libre tant que rien n'a été versé, appliquée à l'enregistrement.
  const champInscription = (f: any) => {
    const modifiable = f.id === inscriptionModifiable?.id;
    const type = modifiable && typeChoisi ? typeChoisi : typeDe(f);
    return (
      <Stack key={f.id} gap={6}>
        {modifiable && (
          <SegmentedControl
            data={[
              { value: 'INSCRIPTION', label: 'Inscription' },
              { value: 'REINSCRIPTION', label: 'Réinscription' },
            ]}
            value={type}
            onChange={(v) => {
              setTypeChoisi(v as TypeInscription);
              setMontants((m) => ({ ...m, [f.id]: '' }));
            }}
          />
        )}
        {champ(f, type === 'REINSCRIPTION' ? 'Réinscription' : 'Inscription')}
      </Stack>
    );
  };

  const champ = (f: any, titre: string) => (
    <Group key={f.id} align="flex-end" wrap="nowrap">
      <NumberInput
        label={titre}
        description={`${typeChange(f) ? (typeChoisi === 'REINSCRIPTION' ? 'Frais de réinscription' : "Frais d'inscription") : f.libelle} : reste ${fmt(reste(f))} GNF${f.dateEcheance ? `, échéance le ${new Date(f.dateEcheance).toLocaleDateString('fr-FR')}` : ''}`}
        placeholder="0"
        value={montants[f.id] ?? ''}
        onChange={(v) => setMontants((m) => ({ ...m, [f.id]: v === '' ? '' : Number(v) }))}
        min={0}
        max={reste(f)}
        thousandSeparator=" "
        error={Number(montants[f.id] || 0) > reste(f) ? 'Dépasse le reste à payer' : undefined}
        style={{ flex: 1 }}
      />
      <Button variant="light" onClick={() => setMontants((m) => ({ ...m, [f.id]: reste(f) }))}>
        Solder
      </Button>
    </Group>
  );

  return (
    <Modal opened={opened} onClose={onClose} title="Payer" size="lg">
      <Stack>
        {lignes.length === 0 && <Text c="dimmed">Rien à payer pour cet élève.</Text>}
        {l.inscription.map(champInscription)}
        {l.assurance.map((f) => champ(f, 'T-shirt'))}
        {l.tranche && champ(l.tranche, `Écolage : ${l.tranche.libelle.replace(/^.* - /, '')}`)}
        {l.tranchesSuivantes.length > 0 && (
          <Text size="xs" c="dimmed">
            {l.tranchesSuivantes.map((f) => f.libelle.replace(/^.* - /, '')).join(', ')} : payable(s) une fois{' '}
            {l.tranche?.libelle.replace(/^.* - /, '')} soldée.
          </Text>
        )}
        {l.autres.map((f) => champ(f, 'Autre facture'))}

        {lignes.length > 0 && (
          <>
            <Divider />
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
              allowDeselect={false}
            />
            <Group justify="space-between">
              <Text fw={600}>Total à encaisser : {fmt(total)} GNF</Text>
              <Button disabled={total <= 0 || !!depassement} loading={mutation.isPending} onClick={() => mutation.mutate()}>
                Enregistrer {aEnregistrer.length > 1 ? `les ${aEnregistrer.length} paiements` : 'le paiement'}
              </Button>
            </Group>
          </>
        )}

        {recus.length > 0 && (
          <Alert color="green" title={recus.length > 1 ? `Reçu : ${fmt(recus.reduce((a, r) => a + r.montant, 0))} GNF` : 'Reçu'}>
            <Stack gap={4}>
              {/* Paiements enregistrés ensemble : un seul reçu pour le total (n'importe lequel l'ouvre) */}
              {(recus.length > 1 ? [{ ...recus[0], libelle: recus.map((r) => `${r.libelle} : ${fmt(r.montant)} GNF`).join(' · '), montant: recus.reduce((a, r) => a + r.montant, 0) }] : recus).map((r) => (
                <Group key={r.id} justify="space-between">
                  <Text size="sm">{recus.length > 1 ? r.libelle : `${r.libelle} : ${fmt(r.montant)} GNF`}</Text>
                  <Tooltip label="Disponible une fois le paiement synchronisé" disabled={!idsEnAttente.has(r.id)}>
                    <Anchor
                      component="button"
                      size="sm"
                      disabled={idsEnAttente.has(r.id)}
                      onClick={() => !idsEnAttente.has(r.id) && ouvrirRecu(r.id)}
                    >
                      Voir le reçu
                    </Anchor>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </Alert>
        )}
      </Stack>
    </Modal>
  );
}
