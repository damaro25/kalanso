import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Group, Modal, NumberInput, Paper, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { createPaiement, libelleRegime, ouvrirRecu } from '../../api/finances';
import {
  desinscrireFormation,
  facturerFormations,
  fetchFormations,
  fetchFormationsEleve,
  inscrireFormation,
  moisCourant,
  resumeFacturation,
} from '../../api/formations';

function erreur(e: unknown, defaut: string) {
  notifications.show({ message: (e as any)?.response?.data?.message ?? defaut, color: 'red' });
}

// Formations supplémentaires de l'élève pour l'année courante : inscrire / désinscrire, gratuité selon son régime,
// et « Facturer le mois » (la facture apparaît ensuite dans ses factures et s'encaisse comme les autres).
export function FormationsEleve({ eleveId, peutFacturer }: { eleveId: string; peutFacturer: boolean }) {
  const queryClient = useQueryClient();
  const { data } = useQuery({ queryKey: ['formations-eleve', eleveId], queryFn: () => fetchFormationsEleve(eleveId) });
  const { data: catalogue } = useQuery({ queryKey: ['formations'], queryFn: fetchFormations });
  const [choix, setChoix] = useState<string | null>(null);
  const [mois, setMois] = useState(moisCourant());

  const apres = (resultat: unknown) => {
    queryClient.setQueryData(['formations-eleve', eleveId], resultat);
    queryClient.invalidateQueries({ queryKey: ['formations'] });
    // la facture du mois créée à l'inscription apparaît dans les factures de la fiche et dans les impayés
    queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
    queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
  };
  const inscrire = useMutation({
    mutationFn: () => inscrireFormation(eleveId, choix!),
    onSuccess: (r) => {
      apres(r);
      setChoix(null);
      const creees = r.facturation?.creees ?? 0;
      notifications.show({
        message: creees
          ? `Élève inscrit : facture de ${r.mois?.libelle ?? 'ce mois'} créée, à encaisser`
          : 'Élève inscrit à la formation',
        color: 'green',
      });
    },
    onError: (e) => erreur(e, "Erreur lors de l'inscription"),
  });
  const desinscrire = useMutation({
    mutationFn: (formationId: string) => desinscrireFormation(eleveId, formationId),
    onSuccess: (r) => {
      apres(r);
      notifications.show({ message: 'Élève désinscrit de la formation', color: 'green' });
    },
    onError: (e) => erreur(e, 'Erreur lors de la désinscription'),
  });
  // Encaissement de la facture du mois (flux de paiement habituel, reçu numéroté, bordereau « Formations »)
  const [aEncaisser, setAEncaisser] = useState<{ id: string; nom: string; reste: number } | null>(null);
  const [montant, setMontant] = useState<number | ''>('');
  const [recu, setRecu] = useState<string | null>(null);
  const encaisser = useMutation({
    mutationFn: () => createPaiement({ factureId: aEncaisser!.id, montant: Number(montant), mode: 'ESPECES' }),
    onSuccess: (p) => {
      setRecu(p.id);
      queryClient.invalidateQueries({ queryKey: ['formations-eleve', eleveId] });
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: 'Paiement de la formation enregistré', color: 'green' });
    },
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement du paiement"),
  });

  const facturer = useMutation({
    mutationFn: () => facturerFormations(mois, eleveId),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', eleveId] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: resumeFacturation(r), color: r.creees ? 'green' : 'blue' });
    },
    onError: (e) => erreur(e, 'Erreur lors de la facturation'),
  });

  if (!data) return null;
  const dejaInscrites = new Set(data.formations.map((f) => f.formationId));
  const proposables = (catalogue ?? []).filter((f) => f.actif && !dejaInscrites.has(f.id));

  return (
    <Paper withBorder p="md">
      <Title order={4} mb={4}>
        Formations supplémentaires
      </Title>
      <Text size="sm" c="dimmed" mb="sm">
        Année {data.anneeScolaire.libelle}
        {data.regime ? ` · régime ${libelleRegime(data.regime).toLowerCase()}` : ''}
      </Text>

      <Stack gap="xs" mb="sm">
        {data.formations.length === 0 && <Text c="dimmed">Aucune formation supplémentaire.</Text>}
        {data.formations.map((f) => (
          <Group key={f.formationId} justify="space-between">
            <Group gap="xs">
              <Text fw={600}>{f.nom}</Text>
              {f.gratuit ? (
                <Badge color="green" variant="light">
                  Gratuit
                </Badge>
              ) : (
                <Text size="sm">{f.montantMensuel ? `${f.montantMensuel.toLocaleString('fr-FR')} GNF / mois` : 'Tarif à saisir'}</Text>
              )}
              {f.factureMois && (
                <Badge color={f.factureMois.paye >= f.factureMois.montant ? 'green' : 'orange'} variant="light">
                  {data.mois?.libelle} : {f.factureMois.paye >= f.factureMois.montant ? 'payé' : `${(f.factureMois.montant - f.factureMois.paye).toLocaleString('fr-FR')} GNF à payer`}
                </Badge>
              )}
              {!f.gratuit && f.montantMensuel > 0 && !f.factureMois && (
                <Badge color="gray" variant="light">
                  {data.mois?.libelle} : pas encore facturé
                </Badge>
              )}
              {f.factureMois && f.factureMois.paye < f.factureMois.montant && (
                <Button
                  size="compact-xs"
                  onClick={() => {
                    const reste = f.factureMois!.montant - f.factureMois!.paye;
                    setAEncaisser({ id: f.factureMois!.id, nom: f.nom, reste });
                    setMontant(reste);
                    setRecu(null);
                  }}
                >
                  Encaisser
                </Button>
              )}
            </Group>
            <Button size="xs" variant="subtle" color="red" loading={desinscrire.isPending} onClick={() => desinscrire.mutate(f.formationId)}>
              Désinscrire
            </Button>
          </Group>
        ))}
      </Stack>

      <Group align="flex-end">
        <Select
          placeholder={proposables.length ? 'Choisir une formation' : 'Aucune autre formation disponible'}
          data={proposables.map((f) => ({ value: f.id, label: `${f.nom}${f.tarifMensuel ? ` (${f.tarifMensuel.toLocaleString('fr-FR')} GNF/mois)` : ''}` }))}
          value={choix}
          onChange={setChoix}
          disabled={!proposables.length}
          w={{ base: '100%', sm: 280 }}
        />
        <Button disabled={!choix} loading={inscrire.isPending} onClick={() => inscrire.mutate()}>
          Inscrire
        </Button>
        {peutFacturer && data.formations.length > 0 && (
          <>
            <TextInput type="month" label="Mois" value={mois} onChange={(e) => setMois(e.currentTarget.value)} w={170} />
            <Button variant="light" disabled={!mois} loading={facturer.isPending} onClick={() => facturer.mutate()}>
              Facturer le mois
            </Button>
          </>
        )}
      </Group>

      <Modal opened={!!aEncaisser} onClose={() => setAEncaisser(null)} title={`Formation ${aEncaisser?.nom ?? ''} — ${data.mois?.libelle ?? ''}`}>
        <Stack>
          <Text size="sm">Reste à payer : {(aEncaisser?.reste ?? 0).toLocaleString('fr-FR')} GNF (espèces)</Text>
          <NumberInput label="Montant (GNF)" value={montant} onChange={(v) => setMontant(v === '' ? '' : Number(v))} min={1} thousandSeparator=" " />
          <Button disabled={!montant} loading={encaisser.isPending} onClick={() => encaisser.mutate()}>
            Enregistrer le paiement
          </Button>
          {recu && (
            <Button variant="light" onClick={() => ouvrirRecu(recu)}>
              Voir le reçu
            </Button>
          )}
        </Stack>
      </Modal>
    </Paper>
  );
}
