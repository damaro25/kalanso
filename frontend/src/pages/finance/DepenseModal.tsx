import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Modal, NumberInput, Select, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { creerMouvement, type TresorerieMensuelle } from '../../api/finance';
import { MODES_PAIEMENT_DEPENSE, POSTES_DEPENSE } from './postes';

const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

// « 2026-10-15 » -> « Octobre 2026 »
function moisEnClair(date: string) {
  return `${MOIS[Number(date.slice(5, 7)) - 1] ?? ''} ${date.slice(0, 4)}`.trim();
}

// Aujourd'hui, ramené dans l'année scolaire : une dépense hors période n'apparaîtrait dans aucun tableau.
function dateParDefaut(periode?: { debut: string; fin: string }) {
  const aujourdhui = new Date().toISOString().slice(0, 10);
  if (!periode) return aujourdhui;
  return aujourdhui < periode.debut ? periode.debut : aujourdhui > periode.fin ? periode.fin : aujourdhui;
}

// Enregistrement d'une dépense par poste, comme dans le tableau des décaissements :
// choisir le poste, le montant et la date. La dépense alimente aussitôt le tableau de trésorerie.
export function DepenseModal({
  opened,
  onClose,
  tresorerie,
}: {
  opened: boolean;
  onClose: () => void;
  tresorerie?: TresorerieMensuelle;
}) {
  const queryClient = useQueryClient();
  const periode = tresorerie?.periode;

  const [poste, setPoste] = useState<string | null>(POSTES_DEPENSE[0]);
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState<number | ''>('');
  const [date, setDate] = useState(dateParDefaut(periode));
  const [mode, setMode] = useState<string | null>(null);

  useEffect(() => {
    if (opened) setDate(dateParDefaut(periode));
  }, [opened, periode?.debut, periode?.fin]);

  const horsPeriode = !!periode && !!date && (date < periode.debut || date > periode.fin);

  // Déjà enregistré pour ce poste ce mois-là (repère, comme la cellule du tableau).
  const indexMois = tresorerie?.mois.findIndex((m) => `${m.annee}-${String(m.mois).padStart(2, '0')}` === date.slice(0, 7)) ?? -1;
  const ligne = tresorerie?.decaissements.lignes.find((l) => l.origine === 'MOUVEMENT' && l.libelle === poste);
  const dejaEnregistre = ligne && indexMois >= 0 ? ligne.parMois[indexMois] : 0;

  const mutation = useMutation({
    mutationFn: () =>
      creerMouvement({
        type: 'DEPENSE',
        categorie: poste ?? 'Autre',
        libelle: libelle.trim() || `${poste} - ${moisEnClair(date)}`,
        montant: Number(montant),
        date,
        modePaiement: mode ?? undefined,
      }),
    onSuccess: () => {
      for (const cle of ['finance-dashboard', 'finance-cr', 'finance-mouvements', 'finance-tresorerie', 'dashboard-tresorerie']) {
        queryClient.invalidateQueries({ queryKey: [cle] });
      }
      notifications.show({ message: 'Dépense enregistrée', color: 'green' });
      setLibelle('');
      setMontant('');
      onClose();
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const invalide = !poste || montant === '' || Number(montant) <= 0 || !date || horsPeriode;

  return (
    <Modal opened={opened} onClose={onClose} title="Nouvelle dépense">
      <Stack>
        <Select label="Poste de dépense" data={POSTES_DEPENSE} value={poste} onChange={setPoste} allowDeselect={false} />
        <Text size="xs" c="dimmed" mt={-8}>
          Les salaires ne se saisissent pas ici : ils viennent des bulletins de paie.
        </Text>
        <NumberInput
          label="Montant (GNF)"
          min={0}
          thousandSeparator=" "
          value={montant}
          onChange={(v) => setMontant(v === '' ? '' : Number(v))}
        />
        <TextInput
          label="Date"
          type="date"
          value={date}
          min={periode?.debut}
          max={periode?.fin}
          onChange={(e) => setDate(e.currentTarget.value)}
          error={horsPeriode ? "Cette date est en dehors de l'année scolaire" : undefined}
        />
        {dejaEnregistre > 0 && (
          <Text size="sm" c="dimmed">
            Déjà enregistré pour {poste} en {moisEnClair(date)} : {fmt(dejaEnregistre)} GNF
          </Text>
        )}
        <TextInput
          label="Libellé (facultatif)"
          placeholder={poste && date ? `${poste} - ${moisEnClair(date)}` : undefined}
          value={libelle}
          onChange={(e) => setLibelle(e.currentTarget.value)}
        />
        <Select label="Mode de paiement (facultatif)" data={MODES_PAIEMENT_DEPENSE} value={mode} onChange={setMode} clearable />
        <Button disabled={invalide} loading={mutation.isPending} onClick={() => mutation.mutate()}>
          Enregistrer la dépense
        </Button>
      </Stack>
    </Modal>
  );
}
