import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Group,
  List,
  NumberInput,
  Paper,
  PasswordInput,
  SegmentedControl,
  Select,
  SimpleGrid,
  Stack,
  Stepper,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconCheck, IconLock } from '@tabler/icons-react';
import { fetchAnneesScolaires, libelleAnnee } from '../../api/classes';
import {
  apercuCloture,
  executerCloture,
  fetchHistoriqueClotures,
  type OptionsCloture,
  type RapportCloture,
} from '../../api/cloture';

function fmt(n: number) {
  return `${n.toLocaleString('fr-FR')} GNF`;
}

function erreurDe(e: any, defaut: string) {
  return e?.response?.data?.message ?? defaut;
}

function Chiffre({ label, valeur, couleur }: { label: string; valeur: string | number; couleur?: string }) {
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

const NOUVELLE = '__nouvelle__';

// Finances > Clôture d'année : clôturer une année scolaire et initialiser la suivante, en 4 étapes (années,
// contrôles, options, aperçu puis confirmation avec le code de sécurité). L'exécution se fait côté serveur dans
// une seule transaction, après une sauvegarde automatique de la base.
export function ClotureAnneePage() {
  const queryClient = useQueryClient();
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const { data: historique } = useQuery({ queryKey: ['finance-clotures'], queryFn: fetchHistoriqueClotures });

  const [etape, setEtape] = useState(0);
  const [anneeId, setAnneeId] = useState<string | null>(null);
  const [suivanteId, setSuivanteId] = useState<string>(NOUVELLE);
  const [suivanteLibelle, setSuivanteLibelle] = useState('');
  const [suivanteDebut, setSuivanteDebut] = useState('');
  const [suivanteFin, setSuivanteFin] = useState('');
  const [options, setOptions] = useState<OptionsCloture>({
    copierClasses: true,
    tarifs: 'IDENTIQUES',
    ajustementPct: 0,
    decalerEcheances: true,
    fraisReinscription: null,
    reinscrire: true,
    genererFactures: true,
    rendreCourante: true,
  });
  const [code, setCode] = useState('');
  const [sansSauvegarde, setSansSauvegarde] = useState(false);
  const [rapport, setRapport] = useState<RapportCloture | null>(null);

  // Par défaut : l'année courante, et l'année suivante proposée par le serveur (+1 an)
  useEffect(() => {
    if (!anneeId && annees?.length) setAnneeId((annees.find((a) => a.courante) ?? annees[0]).id);
  }, [anneeId, annees]);

  const opts: OptionsCloture = {
    ...options,
    anneeId: anneeId ?? undefined,
    ...(suivanteId === NOUVELLE
      ? { suivanteLibelle: suivanteLibelle || undefined, suivanteDebut: suivanteDebut || undefined, suivanteFin: suivanteFin || undefined }
      : { suivanteId }),
  };

  const apercu = useQuery({
    queryKey: ['finance-cloture-apercu', JSON.stringify(opts)],
    queryFn: () => apercuCloture(opts),
    enabled: !!anneeId,
    retry: false,
  });
  // Propose le libellé et les dates de l'année suivante calculés par le serveur
  useEffect(() => {
    const s = apercu.data?.plan.anneeSuivante;
    if (s && suivanteId === NOUVELLE && !suivanteLibelle) {
      setSuivanteLibelle(s.libelle);
      setSuivanteDebut(s.dateDebut);
      setSuivanteFin(s.dateFin);
    }
  }, [apercu.data, suivanteId, suivanteLibelle]);

  const executer = useMutation({
    mutationFn: () => executerCloture({ ...opts, code, sansSauvegarde }),
    onSuccess: (r) => {
      setRapport(r);
      setEtape(4);
      queryClient.invalidateQueries({ queryKey: ['annees-scolaires'] });
      queryClient.invalidateQueries({ queryKey: ['finance-clotures'] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      notifications.show({ message: `Année ${r.anneeCloturee.libelle} clôturée`, color: 'green' });
    },
    onError: (e) => notifications.show({ message: erreurDe(e, 'La clôture a échoué : rien n’a été modifié'), color: 'red' }),
  });

  const annee = annees?.find((a) => a.id === anneeId);
  const autres = (annees ?? []).filter((a) => a.id !== anneeId);
  const c = apercu.data?.controles;
  const p = apercu.data?.plan;
  const opt = <K extends keyof OptionsCloture>(cle: K, v: OptionsCloture[K]) => setOptions((o) => ({ ...o, [cle]: v }));

  return (
    <Stack>
      <div>
        <Title order={2}>Clôture d'année</Title>
        <Text c="dimmed" size="sm">
          Clôturer une année scolaire et préparer la suivante : classes, tarifs, réinscriptions et factures.
        </Text>
      </div>

      {apercu.isError && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />}>
          {erreurDe(apercu.error, "Impossible de préparer la clôture")}
        </Alert>
      )}

      <Paper withBorder p="md">
        <Stepper active={etape} onStepClick={(i) => i < 4 && !rapport && setEtape(i)} size="sm">
          <Stepper.Step label="Années" description="À clôturer, suivante">
            <Stack mt="md">
              <Select
                label="Année à clôturer"
                data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
                value={anneeId}
                onChange={(v) => {
                  setAnneeId(v);
                  setSuivanteLibelle('');
                }}
                allowDeselect={false}
                w={{ base: '100%', sm: 300 }}
              />
              {annee?.cloturee && (
                <Alert color="yellow">Cette année est déjà clôturée : relancer ne créera que ce qui manque encore.</Alert>
              )}
              <Select
                label="Année suivante"
                data={[{ value: NOUVELLE, label: 'Nouvelle année (à créer)' }, ...autres.map((a) => ({ value: a.id, label: libelleAnnee(a) }))]}
                value={suivanteId}
                onChange={(v) => v && setSuivanteId(v)}
                allowDeselect={false}
                w={{ base: '100%', sm: 300 }}
              />
              {suivanteId === NOUVELLE && (
                <SimpleGrid cols={{ base: 1, sm: 3 }}>
                  <TextInput label="Libellé" value={suivanteLibelle} onChange={(e) => setSuivanteLibelle(e.currentTarget.value)} />
                  <TextInput label="Début" type="date" value={suivanteDebut} onChange={(e) => setSuivanteDebut(e.currentTarget.value)} />
                  <TextInput label="Fin" type="date" value={suivanteFin} onChange={(e) => setSuivanteFin(e.currentTarget.value)} />
                </SimpleGrid>
              )}
              <Group justify="flex-end">
                <Button disabled={!anneeId || apercu.isError} onClick={() => setEtape(1)}>
                  Suivant : contrôles
                </Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Contrôles" description="Avant clôture">
            {c && p && (
              <Stack mt="md">
                <SimpleGrid cols={{ base: 2, sm: 4 }}>
                  <Chiffre label="Élèves inscrits" valeur={c.elevesInscrits} />
                  <Chiffre label={`Paiements (${c.paiements.nombre})`} valeur={fmt(c.paiements.total)} />
                  <Chiffre
                    label={`Impayés (${c.impayes.nombre} factures)`}
                    valeur={fmt(c.impayes.reste)}
                    couleur={c.impayes.reste > 0 ? 'orange' : undefined}
                  />
                  <Chiffre
                    label={`Déjà dans ${p.anneeSuivante.libelle}`}
                    valeur={`${c.suivante.classes} classes · ${c.suivante.tarifs} tarifs`}
                  />
                </SimpleGrid>
                {c.impayes.reste > 0 && (
                  <Alert color="orange" variant="light">
                    Les {fmt(c.impayes.reste)} d'impayés restent exigibles après la clôture : ils apparaîtront comme arriérés dans
                    « Factures impayées » et pourront toujours être encaissés.
                  </Alert>
                )}
                <List size="sm" spacing={4} icon={<IconCheck size={14} color="green" />}>
                  <List.Item>
                    Factures dont le montant payé correspond à leurs paiements :{' '}
                    {c.facturesIncoherentes === 0 ? 'toutes' : <b style={{ color: 'red' }}>{c.facturesIncoherentes} incohérente(s)</b>}
                  </List.Item>
                  <List.Item>
                    Numéros de reçu : {c.recus.sansNumero} manquant(s), {c.recus.doublons} en double
                  </List.Item>
                </List>
                {c.alertes.map((a) => (
                  <Alert key={a} color={c.bloquant ? 'red' : 'yellow'} icon={<IconAlertTriangle size={18} />}>
                    {a}
                  </Alert>
                ))}
                <Group justify="space-between">
                  <Button variant="default" onClick={() => setEtape(0)}>
                    Retour
                  </Button>
                  <Button disabled={c.bloquant} onClick={() => setEtape(2)}>
                    Suivant : options
                  </Button>
                </Group>
              </Stack>
            )}
          </Stepper.Step>

          <Stepper.Step label="Options" description="Initialisation">
            <Stack mt="md">
              <Switch label="Recopier les classes" checked={!!options.copierClasses} onChange={(e) => opt('copierClasses', e.currentTarget.checked)} />
              <div>
                <Text size="sm" fw={500} mb={4}>
                  Tarifs d'écolage et frais d'inscription
                </Text>
                <SegmentedControl
                  value={options.tarifs}
                  onChange={(v) => opt('tarifs', v as OptionsCloture['tarifs'])}
                  data={[
                    { value: 'IDENTIQUES', label: 'Mêmes montants' },
                    { value: 'AJUSTES', label: 'Ajustés en %' },
                    { value: 'AUCUN', label: 'Ne pas recopier' },
                  ]}
                />
              </div>
              {options.tarifs === 'AJUSTES' && (
                <NumberInput
                  label="Ajustement (%)"
                  description="Ex. 5 pour +5 % ; montants arrondis au millier"
                  value={options.ajustementPct}
                  onChange={(v) => opt('ajustementPct', typeof v === 'number' ? v : 0)}
                  min={-50}
                  max={100}
                  w={200}
                />
              )}
              {options.tarifs !== 'AUCUN' && (
                <>
                  <Switch
                    label="Décaler les échéances d'un an"
                    checked={!!options.decalerEcheances}
                    onChange={(e) => opt('decalerEcheances', e.currentTarget.checked)}
                  />
                  <NumberInput
                    label="Frais de réinscription (GNF)"
                    description="Vide : ceux de l'année clôturée, niveau par niveau"
                    value={options.fraisReinscription ?? ''}
                    onChange={(v) => opt('fraisReinscription', typeof v === 'number' ? v : null)}
                    min={0}
                    thousandSeparator=" "
                    w={260}
                  />
                </>
              )}
              <Switch
                label="Réinscrire les élèves au niveau supérieur, même régime (les élèves de la dernière classe sortent)"
                checked={!!options.reinscrire}
                onChange={(e) => opt('reinscrire', e.currentTarget.checked)}
              />
              <Switch
                label="Générer les factures de l'année suivante"
                checked={!!options.genererFactures}
                disabled={!options.reinscrire}
                onChange={(e) => opt('genererFactures', e.currentTarget.checked)}
              />
              <Switch
                label="Rendre l'année suivante courante"
                checked={!!options.rendreCourante}
                onChange={(e) => opt('rendreCourante', e.currentTarget.checked)}
              />
              <Group justify="space-between">
                <Button variant="default" onClick={() => setEtape(1)}>
                  Retour
                </Button>
                <Button onClick={() => setEtape(3)}>Suivant : aperçu</Button>
              </Group>
            </Stack>
          </Stepper.Step>

          <Stepper.Step label="Aperçu" description="Confirmation">
            {p && (
              <Stack mt="md">
                <Text>
                  Clôture de <b>{p.anneeCloturee.libelle}</b>, année suivante <b>{p.anneeSuivante.libelle}</b>
                  {p.anneeSuivante.aCreer ? ` (à créer, du ${p.anneeSuivante.dateDebut.split('-').reverse().join('/')} au ${p.anneeSuivante.dateFin.split('-').reverse().join('/')})` : ' (existante)'}
                </Text>
                <SimpleGrid cols={{ base: 2, sm: 5 }}>
                  <Chiffre label="Classes à créer" valeur={p.classesACreer} />
                  <Chiffre label="Tarifs à créer" valeur={p.tarifsACreer} />
                  <Chiffre label="Frais d'inscription" valeur={p.fraisACreer} />
                  <Chiffre label="Réinscriptions" valeur={p.reinscriptions} />
                  <Chiffre label="Total facturé prévu" valeur={fmt(p.totalFacturePrevu)} />
                </SimpleGrid>
                {p.reinscriptionsParClasse.length > 0 && (
                  <Table withTableBorder fz="sm">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Classe</Table.Th>
                        <Table.Th>Vers</Table.Th>
                        <Table.Th ta="center">Élèves</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {p.reinscriptionsParClasse.map((l) => (
                        <Table.Tr key={`${l.origine}-${l.destination}`}>
                          <Table.Td>{l.origine}</Table.Td>
                          <Table.Td>{l.destination}</Table.Td>
                          <Table.Td ta="center">{l.eleves}</Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                )}
                {p.sortants.length > 0 && (
                  <Text size="sm">
                    Sortants (dernière classe, non réinscrits) : {p.sortants.map((s) => `${s.nom} (${s.classe})`).join(', ')}
                  </Text>
                )}
                {p.sansDestination.length > 0 && (
                  <Alert color="yellow">
                    Sans classe de destination (non réinscrits) : {p.sansDestination.map((s) => `${s.nom} (${s.classe})`).join(', ')}
                  </Alert>
                )}
                {p.dejaReinscrits > 0 && <Text size="sm">{p.dejaReinscrits} élève(s) déjà inscrit(s) dans l'année suivante : inchangés.</Text>}

                <Alert color="blue" variant="light" icon={<IconLock size={18} />}>
                  Après la clôture, l'année {p.anneeCloturee.libelle} n'accepte plus de nouvelles factures, d'inscriptions ni de
                  changements de tarifs ; ses impayés restent encaissables. Une sauvegarde de la base est faite automatiquement
                  avant la clôture, et tout est annulé en cas d'erreur.
                </Alert>
                <Group align="flex-end">
                  <PasswordInput
                    label="Code de sécurité"
                    description="Le même que pour modifier les dépenses et le budget"
                    value={code}
                    onChange={(e) => setCode(e.currentTarget.value)}
                    w={260}
                  />
                  <Checkbox
                    label="Continuer sans sauvegarde automatique si elle est impossible"
                    checked={sansSauvegarde}
                    onChange={(e) => setSansSauvegarde(e.currentTarget.checked)}
                  />
                </Group>
                <Group justify="space-between">
                  <Button variant="default" onClick={() => setEtape(2)}>
                    Retour
                  </Button>
                  <Button color="red" leftSection={<IconLock size={16} />} disabled={!code} loading={executer.isPending} onClick={() => executer.mutate()}>
                    Clôturer {p.anneeCloturee.libelle}
                  </Button>
                </Group>
              </Stack>
            )}
          </Stepper.Step>

          <Stepper.Completed>
            {rapport && (
              <Stack mt="md">
                <Alert color="green" icon={<IconCheck size={18} />}>
                  {rapport.anneeCloturee.libelle} est clôturée. {rapport.anneeSuivante.libelle}
                  {opts.rendreCourante ? ' est maintenant l’année courante.' : ' est prête.'}
                </Alert>
                <SimpleGrid cols={{ base: 2, sm: 5 }}>
                  <Chiffre label="Classes créées" valeur={rapport.classesACreer} />
                  <Chiffre label="Tarifs créés" valeur={rapport.tarifsACreer} />
                  <Chiffre label="Réinscriptions" valeur={rapport.reinscriptions} />
                  <Chiffre label="Factures créées" valeur={rapport.facturesCreees} />
                  <Chiffre label="Total facturé" valeur={fmt(rapport.totalFacturePrevu)} />
                </SimpleGrid>
                <Text size="sm" c="dimmed">
                  Sauvegarde : {rapport.sauvegarde ?? 'non faite (continuée sans sauvegarde automatique)'}
                </Text>
              </Stack>
            )}
          </Stepper.Completed>
        </Stepper>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Historique des clôtures
        </Title>
        {!historique?.length ? (
          <Text c="dimmed">Aucune année clôturée pour le moment.</Text>
        ) : (
          <Table striped fz="sm">
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Année</Table.Th>
                <Table.Th>Clôturée le</Table.Th>
                <Table.Th>Par</Table.Th>
                <Table.Th>Résumé</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {historique.map((h) => (
                <Table.Tr key={h.anneeId}>
                  <Table.Td>
                    <Badge color="gray" variant="light">
                      {h.libelle}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{h.clotureLe ? new Date(h.clotureLe).toLocaleString('fr-FR') : '—'}</Table.Td>
                  <Table.Td>{h.cloturePar ?? '—'}</Table.Td>
                  <Table.Td>
                    {h.resume
                      ? `→ ${h.resume.anneeSuivante?.libelle ?? ''} : ${h.resume.classesACreer ?? 0} classes, ${h.resume.tarifsACreer ?? 0} tarifs, ${h.resume.reinscriptions ?? 0} réinscriptions, ${h.resume.facturesCreees ?? 0} factures (${fmt(h.resume.totalFacturePrevu ?? 0)})`
                      : '—'}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>
    </Stack>
  );
}
