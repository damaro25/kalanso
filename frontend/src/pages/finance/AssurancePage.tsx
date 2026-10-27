import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Anchor, Badge, Button, Group, Modal, NumberInput, Paper, Select, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconFileInvoice, IconInfoCircle } from '@tabler/icons-react';
import { fetchAnneesScolaires, fetchClasses, libelleAnnee } from '../../api/classes';
import { REGIMES, createPaiement, libelleRegime, ouvrirRecu, type Regime } from '../../api/finances';
import {
  STATUTS_ASSURANCE,
  facturerAssurance,
  fetchSuiviAssurance,
  telechargerAssurance,
  type LigneAssurance,
  type StatutAssurance,
} from '../../api/assurance';

function fmt(n: number) {
  return `${n.toLocaleString('fr-FR')} GNF`;
}

function Chiffre({ label, valeur, couleur }: { label: string; valeur: string; couleur?: string }) {
  return (
    <Paper withBorder p="sm">
      <Text size="xs" c="dimmed">
        {label}
      </Text>
      <Text fw={700} c={couleur}>
        {valeur}
      </Text>
    </Paper>
  );
}

// Finances > Assurance : élèves de l'année et statut de leur assurance scolaire, encaissement (flux de paiement
// habituel, reçu numéroté), facturation des élèves pas encore facturés, export Excel.
export function AssurancePage() {
  const queryClient = useQueryClient();
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });
  const [anneeId, setAnneeId] = useState<string | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [regime, setRegime] = useState<string | null>(null);
  const [statut, setStatut] = useState<string | null>(null);
  const filtres = {
    anneeScolaireId: anneeId ?? undefined,
    classeId: classeId ?? undefined,
    regime: (regime ?? undefined) as Regime | undefined,
    statut: (statut ?? undefined) as StatutAssurance | undefined,
  };

  const { data, isError, error } = useQuery({
    queryKey: ['finance-assurance', filtres],
    queryFn: () => fetchSuiviAssurance(filtres),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const anneeAffichee = anneeId ?? data?.anneeScolaire.id;
  const classesAnnee = (classes ?? []).filter((c) => c.anneeScolaire?.id === anneeAffichee);

  const facturer = useMutation({
    mutationFn: () => facturerAssurance(anneeAffichee),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: ['finance-assurance'] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({
        message: `${r.creees} facture(s) de T-shirt créée(s) (${fmt(r.total)}) · ${r.dejaFacturees} déjà facturée(s)${r.sansMontant ? ` · ${r.sansMontant} sans montant configuré` : ''}`,
        color: r.creees ? 'green' : 'blue',
      });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors de la facturation', color: 'red' }),
  });

  // Encaissement
  const [aEncaisser, setAEncaisser] = useState<LigneAssurance | null>(null);
  const [montant, setMontant] = useState<number | ''>('');
  const [mode, setMode] = useState<string | null>('ESPECES');
  const [dernierPaiement, setDernierPaiement] = useState<string | null>(null);
  const encaisser = useMutation({
    mutationFn: () => createPaiement({ factureId: aEncaisser!.factureId!, montant: Number(montant), mode: mode as any }),
    onSuccess: (p) => {
      queryClient.invalidateQueries({ queryKey: ['finance-assurance'] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: 'Paiement du T-shirt enregistré', color: 'green' });
      setDernierPaiement(p.id);
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? "Erreur lors de l'enregistrement du paiement", color: 'red' }),
  });

  const t = data?.totaux;
  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>T-shirt</Title>
          <Text c="dimmed" size="sm">
            T-shirt annuel, une facture par élève et par année. Montant : Établissement &gt; Configuration.
          </Text>
        </div>
        <Group gap="sm">
          <Button variant="light" leftSection={<IconDownload size={16} />} onClick={() => telechargerAssurance(filtres)}>
            Exporter (Excel)
          </Button>
          <Button
            leftSection={<IconFileInvoice size={16} />}
            loading={facturer.isPending}
            disabled={!data?.montantConfigure || data.anneeScolaire.cloturee || !t?.nonFacturees}
            onClick={() => facturer.mutate()}
          >
            Facturer le T-shirt aux élèves non facturés
          </Button>
        </Group>
      </Group>

      <Group gap="sm" align="flex-end">
        <Select
          label="Année"
          data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
          value={anneeAffichee ?? null}
          onChange={(v) => {
            setAnneeId(v);
            setClasseId(null);
          }}
          allowDeselect={false}
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Classe"
          placeholder="Toutes les classes"
          data={classesAnnee.map((c) => ({ value: c.id, label: c.nom }))}
          value={classeId}
          onChange={setClasseId}
          clearable
          searchable
          w={{ base: '100%', sm: 200 }}
        />
        <Select label="Régime" placeholder="Tous les régimes" data={REGIMES} value={regime} onChange={setRegime} clearable w={{ base: '100%', sm: 180 }} />
        <Select
          label="Statut"
          placeholder="Tous les statuts"
          data={STATUTS_ASSURANCE.map((s) => ({ value: s.value, label: s.label }))}
          value={statut}
          onChange={setStatut}
          clearable
          w={{ base: '100%', sm: 200 }}
        />
      </Group>

      {isError &&
        ((error as any)?.response?.data?.message === 'Aucune année scolaire définie' ? (
          <Alert color="yellow" icon={<IconInfoCircle size={18} />} title="Aucune année scolaire">
            Pour suivre le T-shirt : 1) créez l'année dans{' '}
            <Anchor component={Link} to="/classes">
              Classes &gt; Années scolaires
            </Anchor>{' '}
            et rendez-la courante ; 2) saisissez le montant dans{' '}
            <Anchor component={Link} to="/configuration">
              Établissement &gt; Configuration
            </Anchor>{' '}
            (cadre « T-shirt ») ; 3) inscrivez les élèves : leur facture de T-shirt est créée avec leur
            inscription.
          </Alert>
        ) : (
          <Alert color="red">{(error as any)?.response?.data?.message ?? 'Impossible de charger le T-shirt'}</Alert>
        ))}
      {data && !data.montantConfigure && (
        <Alert color="yellow" icon={<IconInfoCircle size={18} />}>
          Aucun montant de T-shirt n'est configuré pour {data.anneeScolaire.libelle}. Renseignez-le dans{' '}
          <Anchor component={Link} to="/configuration">
            Établissement &gt; Configuration
          </Anchor>
          .
        </Alert>
      )}

      {t && (
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <Chiffre label={`Attendu (${t.eleves} élèves)`} valeur={fmt(t.attendu)} />
          <Chiffre label={`Payé (${t.payees} payées, ${t.partielles} partielles)`} valeur={fmt(t.paye)} couleur="green" />
          <Chiffre label={`Reste (${t.nonPayees} non payées)`} valeur={fmt(t.reste)} couleur={t.reste ? 'red' : undefined} />
          <Chiffre label="Non facturées" valeur={String(t.nonFacturees)} couleur={t.nonFacturees ? 'orange' : undefined} />
        </SimpleGrid>
      )}

      {data && (
        <Paper withBorder p="md">
          {data.lignes.length === 0 ? (
            <Text c="dimmed">Aucun élève pour ces filtres.</Text>
          ) : (
            <Table.ScrollContainer minWidth={760}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Élève</Table.Th>
                    <Table.Th>Classe</Table.Th>
                    <Table.Th>Régime</Table.Th>
                    <Table.Th ta="right">Montant</Table.Th>
                    <Table.Th ta="right">Payé</Table.Th>
                    <Table.Th>Statut</Table.Th>
                    <Table.Th />
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {data.lignes.map((l) => {
                    const s = STATUTS_ASSURANCE.find((x) => x.value === l.statut)!;
                    return (
                      <Table.Tr key={l.eleveId}>
                        <Table.Td>
                          <Anchor component={Link} to={`/eleves/${l.eleveId}`} size="sm">
                            {l.nomComplet}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>{l.classe}</Table.Td>
                        <Table.Td>{libelleRegime(l.regime)}</Table.Td>
                        <Table.Td ta="right">{l.montant ? fmt(l.montant) : '—'}</Table.Td>
                        <Table.Td ta="right">{fmt(l.paye)}</Table.Td>
                        <Table.Td>
                          <Badge color={s.couleur} variant="light">
                            {s.label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {l.factureId && l.reste > 0 && (
                            <Button
                              size="xs"
                              onClick={() => {
                                setAEncaisser(l);
                                setMontant(l.reste);
                                setDernierPaiement(null);
                              }}
                            >
                              Encaisser
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </Paper>
      )}

      <Modal opened={!!aEncaisser} onClose={() => setAEncaisser(null)} title={`T-shirt de ${aEncaisser?.nomComplet ?? ''}`}>
        <Stack>
          <Text size="sm">Reste à payer : {fmt(aEncaisser?.reste ?? 0)}</Text>
          <NumberInput label="Montant (GNF)" value={montant} onChange={(v) => setMontant(v === '' ? '' : Number(v))} min={1} thousandSeparator=" " />
          <Select
            label="Mode de paiement"
            data={[
              { value: 'ESPECES', label: 'Espèces' },
              { value: 'VIREMENT', label: 'Virement' },
              { value: 'CHEQUE', label: 'Chèque' },
              { value: 'MOBILE_MONEY', label: 'Mobile money' },
              { value: 'AUTRE', label: 'Autre' },
            ]}
            value={mode}
            onChange={setMode}
          />
          <Button disabled={!montant} loading={encaisser.isPending} onClick={() => encaisser.mutate()}>
            Enregistrer le paiement
          </Button>
          {dernierPaiement && (
            <Button variant="light" onClick={() => ouvrirRecu(dernierPaiement)}>
              Voir le reçu
            </Button>
          )}
        </Stack>
      </Modal>
    </Stack>
  );
}
