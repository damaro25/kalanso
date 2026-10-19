import { Component, useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Paper,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle, IconPencil, IconPlus } from '@tabler/icons-react';
import { fetchAnneesScolaires, libelleAnnee } from '../../api/classes';
import {
  ajouterPosteBudget,
  ajouterPostesHabituels,
  fetchBudget,
  modifierPosteBudget,
  supprimerPosteBudget,
  type BudgetTresorerie,
  type PosteBudget,
  type PrevisionBudget,
  type ReelBudget,
  type RegimeBudget,
  type TresorerieBudget,
} from '../../api/budget';

// Vérifie que la réponse a bien la forme attendue (un cache d'une version précédente peut ne pas l'avoir).
function budgetComplet(b: BudgetTresorerie | undefined): b is BudgetTresorerie {
  return Boolean(
    b?.anneeScolaire &&
      Array.isArray(b.reel?.colonnes) &&
      Array.isArray(b.reel.encaissements?.regimes) &&
      Array.isArray(b.reel.encaissements.autres) &&
      b.reel.encaissements.creche &&
      Array.isArray(b.reel.decaissements?.lignes) &&
      Array.isArray(b.reel.tresorerie?.finale) &&
      Array.isArray(b.prevision?.colonnes) &&
      Array.isArray(b.prevision.encaissements?.regimes) &&
      b.prevision.encaissements.creche &&
      Array.isArray(b.prevision.decaissements?.lignes) &&
      Array.isArray(b.prevision.tresorerie?.finale) &&
      Array.isArray(b.prevision.realise?.ecartEncaissements),
  );
}

// Filet de sécurité : une erreur d'affichage montre un message au lieu d'une page blanche.
class ProtectionAffichage extends Component<{ children: ReactNode }, { erreur: Error | null }> {
  state = { erreur: null as Error | null };
  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }
  render() {
    if (this.state.erreur) {
      return (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Le budget n'a pas pu s'afficher">
          {this.state.erreur.message}. Rechargez la page ; si le problème persiste, signalez-le.
        </Alert>
      );
    }
    return this.props.children;
  }
}

// Couleurs de la feuille papier
const VERT = '#70AD47';
const ORANGE = '#ED7D31';
const BLEU = '#5B9BD5';
const JAUNE_CLAIR = '#FFE699';
const BLEU_CLAIR = '#BDD7EE';
const JAUNE = '#FFFF00';
const GRIS_CLAIR = '#F2F2F2';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function libelleColonne(c: string) {
  return c === 'Vacances' ? 'Bilan (vacances)' : c;
}

function erreur(e: unknown, defaut: string) {
  notifications.show({ message: (e as any)?.response?.data?.message ?? defaut, color: 'red' });
}

// Cellules de montants d'une ligne (les colonnes puis le total), à droite.
function Montants({ valeurs, total, rouge, fondTotal }: { valeurs: number[]; total: number; rouge?: boolean; fondTotal?: string }) {
  const couleur = (n: number) => (rouge && n < 0 ? 'red' : undefined);
  return (
    <>
      {valeurs.map((v, i) => (
        <Table.Td key={i} ta="right" c={couleur(v)}>
          {fmt(v)}
        </Table.Td>
      ))}
      <Table.Td ta="right" fw={700} c={couleur(total)} bg={fondTotal}>
        {fmt(total)}
      </Table.Td>
    </>
  );
}

function Entete({ couleur, premiere, colonnes, derniere }: { couleur: string; premiere: string; colonnes: string[]; derniere: string }) {
  return (
    <Table.Thead>
      <Table.Tr>
        {[premiere, ...colonnes.map(libelleColonne), derniere].map((c) => (
          <Table.Th key={c} bg={couleur} c="white" ta="center" style={{ whiteSpace: 'nowrap' }}>
            {c}
          </Table.Th>
        ))}
      </Table.Tr>
    </Table.Thead>
  );
}

const PREMIERE = { style: { whiteSpace: 'nowrap' as const } };

// Budget de trésorerie de l'année, comme le budget papier de l'école, en deux onglets :
//   - Réel (par défaut) : tous les paiements, recettes, salaires et dépenses enregistrés, mis à jour en continu
//   - Prévisionnel : écolage payé (montants payés) réparti d'octobre à juin et postes de dépenses saisis. Ajouter un poste est
//     libre ; le modifier ou le supprimer demande le code des dépenses.
export function BudgetTresoreriePage() {
  const queryClient = useQueryClient();
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const [anneeId, setAnneeId] = useState<string | null>(null);
  const requete = useQuery({
    queryKey: ['budget-tresorerie', anneeId],
    queryFn: () => fetchBudget(anneeId ?? undefined),
    refetchInterval: 15000, // temps réel : un paiement ou une dépense saisi ailleurs apparaît sous 15 s
    refetchOnWindowFocus: true,
  });
  const { isLoading, isError, error } = requete;
  // Une réponse d'un ancien format (cache hors ligne d'avant une mise à jour) n'est pas affichée : on attend la nouvelle.
  const data = budgetComplet(requete.data) ? requete.data : undefined;
  useEffect(() => {
    if (!anneeId && data) setAnneeId(data.anneeScolaire.id);
  }, [anneeId, data]);

  const [edition, setEdition] = useState<PosteBudget | 'nouveau' | null>(null);
  const rafraichir = () => queryClient.invalidateQueries({ queryKey: ['budget-tresorerie'] });

  const habituels = useMutation({
    mutationFn: () => ajouterPostesHabituels(data?.anneeScolaire.id),
    onSuccess: () => {
      notifications.show({ message: 'Postes habituels créés', color: 'green' });
      rafraichir();
    },
    onError: (e) => erreur(e, 'Erreur lors de la création des postes'),
  });

  return (
    <Stack>
      <Group justify="space-between" align="flex-end">
        <Title order={2}>Budget de trésorerie</Title>
        <Select
          label="Exercice"
          data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
          value={anneeId}
          onChange={(v) => v && setAnneeId(v)}
          w={{ base: '100%', sm: 200 }}
        />
      </Group>

      {(isLoading || (requete.data && !data && !isError)) && <Text c="dimmed">Chargement...</Text>}
      {isError && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />} title="Impossible de charger le budget">
          {(error as any)?.response?.data?.message ?? 'Le serveur ne répond pas.'}
        </Alert>
      )}
      {!isLoading && !isError && !data && !requete.data && annees?.length === 0 && (
        <Alert color="yellow" title="Aucune année scolaire">
          Créez une année scolaire pour établir son budget de trésorerie.
        </Alert>
      )}

      {data && (
        <ProtectionAffichage>
          <Title order={3} ta="center">
            BUDGET DE TRÉSORERIE POUR L'EXERCICE {data.anneeScolaire.libelle}
          </Title>
          <Text size="xs" c="dimmed" ta="center">
            Mis à jour à {new Date(requete.dataUpdatedAt).toLocaleTimeString('fr-FR')}
          </Text>
          <Tabs defaultValue="reel" keepMounted={false}>
            <Tabs.List mb="md">
              <Tabs.Tab value="reel">Réel</Tabs.Tab>
              <Tabs.Tab value="prevision">Prévisionnel</Tabs.Tab>
            </Tabs.List>
            <Tabs.Panel value="reel">
              <VueReelle reel={data.reel} />
            </Tabs.Panel>
            <Tabs.Panel value="prevision">
              <Stack>
                <Alert color="blue" variant="light">
                  Prévision : l'écolage payé (la somme des montants payés sur l'écolage de l'année) est divisé en 9 mois (octobre à juin) ; les dépenses sont les
                  postes que vous saisissez ci-dessous. Les lignes « Réalisé » comparent au réel.
                </Alert>
                <Encaissements data={data.prevision} />
                <Paper withBorder p="md">
                  <Group justify="space-between" mb="sm">
                    <Title order={4}>BUDGET DES DÉCAISSEMENTS</Title>
                    <Group gap="sm">
                      {data.prevision.decaissements.lignes.length === 0 && (
                        <Button variant="light" loading={habituels.isPending} onClick={() => habituels.mutate()}>
                          Créer les postes habituels
                        </Button>
                      )}
                      <Button leftSection={<IconPlus size={16} />} onClick={() => setEdition('nouveau')}>
                        Ajouter une dépense
                      </Button>
                    </Group>
                  </Group>
                  <Table.ScrollContainer minWidth={1300}>
                    <Table withColumnBorders withTableBorder fz="sm">
                      <Entete couleur={ORANGE} premiere="Postes" colonnes={data.prevision.colonnes} derniere="Total charges" />
                      <Table.Tbody>
                        {data.prevision.decaissements.lignes.map((p) => (
                          <Table.Tr key={p.id}>
                            <Table.Td {...PREMIERE}>
                              <Group gap={4} wrap="nowrap">
                                <ActionIcon variant="subtle" size="sm" aria-label={`Modifier ${p.poste}`} onClick={() => setEdition(p)}>
                                  <IconPencil size={14} />
                                </ActionIcon>
                                {p.poste}
                              </Group>
                            </Table.Td>
                            <Montants valeurs={p.montants} total={p.total} />
                          </Table.Tr>
                        ))}
                        <Table.Tr fw={700} bg={JAUNE_CLAIR}>
                          <Table.Td {...PREMIERE}>Total décaissé</Table.Td>
                          <Montants valeurs={data.prevision.decaissements.total.parMois} total={data.prevision.decaissements.total.total} />
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </Table.ScrollContainer>
                </Paper>
                <Tresorerie data={data.prevision} />
              </Stack>
            </Tabs.Panel>
          </Tabs>
          {edition && (
            <ModalPoste
              poste={edition === 'nouveau' ? null : edition}
              colonnes={data.prevision.colonnes}
              anneeScolaireId={data.anneeScolaire.id}
              onClose={() => setEdition(null)}
              onSucces={rafraichir}
            />
          )}
        </ProtectionAffichage>
      )}
    </Stack>
  );
}

// --- Vue réelle : ce qui a effectivement été encaissé et décaissé ---

function VueReelle({ reel }: { reel: ReelBudget }) {
  const colonnes = reel.colonnes.map((c) => c.libelle);
  const nbCol = colonnes.length + 2;
  const t = reel.tresorerie;
  return (
    <Stack>
      <Paper withBorder p="md">
        <Title order={4} mb={4}>
          ENCAISSEMENTS RÉELS
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Tous les paiements enregistrés (écolage par régime et cycle, inscriptions, autres frais) et les autres recettes, au mois
          du paiement. Total des paiements des élèves : {fmt(reel.encaissements.totalPaiements)} GNF.
        </Text>
        <Table.ScrollContainer minWidth={1300}>
          <Table withColumnBorders withTableBorder fz="sm">
            <Entete couleur={VERT} premiere="Cycle" colonnes={colonnes} derniere="Total" />
            <Table.Tbody>
              {reel.encaissements.regimes.map((r) => (
                <RegimeLignes key={r.regime} regime={r} nbCol={nbCol} />
              ))}
              <Table.Tr fw={700}>
                <Table.Td {...PREMIERE}>{reel.encaissements.creche.libelle}</Table.Td>
                <Montants valeurs={reel.encaissements.creche.parMois} total={reel.encaissements.creche.total} />
              </Table.Tr>
              <Table.Tr>
                <Table.Td colSpan={nbCol} ta="center" fw={700}>
                  Autres encaissements
                </Table.Td>
              </Table.Tr>
              {reel.encaissements.autres.map((l) => (
                <Table.Tr key={l.libelle}>
                  <Table.Td {...PREMIERE}>{l.libelle}</Table.Td>
                  <Montants valeurs={l.parMois} total={l.total} />
                </Table.Tr>
              ))}
              <Table.Tr fw={700} bg={BLEU_CLAIR}>
                <Table.Td {...PREMIERE}>Total encaissé</Table.Td>
                <Montants valeurs={reel.encaissements.total.parMois} total={reel.encaissements.total.total} />
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb={4}>
          DÉCAISSEMENTS RÉELS
        </Title>
        <Text size="xs" c="dimmed" mb="sm">
          Salaires (bulletins de paie) et dépenses saisies, par catégorie, au mois de la dépense.
        </Text>
        <Table.ScrollContainer minWidth={1300}>
          <Table withColumnBorders withTableBorder fz="sm">
            <Entete couleur={ORANGE} premiere="Postes" colonnes={colonnes} derniere="Total charges" />
            <Table.Tbody>
              {reel.decaissements.lignes.map((l) => (
                <Table.Tr key={l.libelle}>
                  <Table.Td {...PREMIERE}>{l.libelle}</Table.Td>
                  <Montants valeurs={l.parMois} total={l.total} />
                </Table.Tr>
              ))}
              <Table.Tr fw={700} bg={JAUNE_CLAIR}>
                <Table.Td {...PREMIERE}>Total décaissé</Table.Td>
                <Montants valeurs={reel.decaissements.total.parMois} total={reel.decaissements.total.total} />
              </Table.Tr>
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          TRÉSORERIE RÉELLE
        </Title>
        <Table.ScrollContainer minWidth={1300}>
          <Table withColumnBorders withTableBorder fz="sm">
            <Entete couleur={BLEU} premiere="Postes" colonnes={colonnes} derniere="Total bénéfice" />
            <Table.Tbody>
              <LignesTresorerie t={t} />
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        <Text size="xs" c="dimmed" mt="xs">
          FT = E − D · TI = TF du mois précédent (0 au départ) · TF = TI + FT
        </Text>
      </Paper>
    </Stack>
  );
}

// Encaissements, décaissements, FT, TI et TF (le total de TF est le bénéfice, sur fond jaune).
function LignesTresorerie({ t }: { t: TresorerieBudget }) {
  return (
    <>
      <Table.Tr>
        <Table.Td {...PREMIERE}>Encaissements</Table.Td>
        <Montants valeurs={t.encaissements} total={t.totalEncaissements} />
      </Table.Tr>
      <Table.Tr>
        <Table.Td {...PREMIERE}>Décaissements</Table.Td>
        <Montants valeurs={t.decaissements} total={t.totalDecaissements} />
      </Table.Tr>
      <Table.Tr fw={700}>
        <Table.Td {...PREMIERE}>Flux de trésorerie</Table.Td>
        <Montants valeurs={t.flux} total={t.benefice} rouge />
      </Table.Tr>
      <Table.Tr>
        <Table.Td {...PREMIERE}>Trésorerie initiale</Table.Td>
        {t.initiale.map((v, i) => (
          <Table.Td key={i} ta="right" c={v < 0 ? 'red' : undefined}>
            {fmt(v)}
          </Table.Td>
        ))}
        <Table.Td />
      </Table.Tr>
      <Table.Tr fw={700}>
        <Table.Td {...PREMIERE}>Trésorerie finale</Table.Td>
        <Montants valeurs={t.finale} total={t.benefice} rouge fondTotal={JAUNE} />
      </Table.Tr>
    </>
  );
}

// --- Prévisionnel ---

function Encaissements({ data }: { data: PrevisionBudget }) {
  const nbCol = data.colonnes.length + 2;
  return (
    <Paper withBorder p="md">
      <Title order={4} mb={4}>
        BUDGET DES ENCAISSEMENTS
      </Title>
      <Text size="xs" c="dimmed" mb="sm">
        Écolage payé pour l'année (montants payés), réparti à parts égales d'octobre à juin.
      </Text>
      <Table.ScrollContainer minWidth={1300}>
        <Table withColumnBorders withTableBorder fz="sm">
          <Entete couleur={VERT} premiere="Cycle" colonnes={data.colonnes} derniere="Total" />
          <Table.Tbody>
            {data.encaissements.regimes.map((r) => (
              <RegimeLignes key={r.regime} regime={r} nbCol={nbCol} />
            ))}
            <Table.Tr fw={700}>
              <Table.Td {...PREMIERE}>{data.encaissements.creche.libelle}</Table.Td>
              <Montants valeurs={data.encaissements.creche.parMois} total={data.encaissements.creche.total} />
            </Table.Tr>
            <Table.Tr fw={700} bg={BLEU_CLAIR}>
              <Table.Td {...PREMIERE}>Total encaissé</Table.Td>
              <Montants valeurs={data.encaissements.total.parMois} total={data.encaissements.total.total} />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
    </Paper>
  );
}

function RegimeLignes({ regime, nbCol }: { regime: RegimeBudget; nbCol: number }) {
  return (
    <>
      <Table.Tr>
        <Table.Td colSpan={nbCol} ta="center" fw={700}>
          {regime.libelle}
        </Table.Td>
      </Table.Tr>
      {regime.lignes.map((l) => (
        <Table.Tr key={l.libelle}>
          <Table.Td {...PREMIERE}>{l.libelle}</Table.Td>
          <Montants valeurs={l.parMois} total={l.total} />
        </Table.Tr>
      ))}
      <Table.Tr fw={700} bg={JAUNE_CLAIR}>
        <Table.Td {...PREMIERE}>Sous-total</Table.Td>
        <Montants valeurs={regime.sousTotal.parMois} total={regime.sousTotal.total} />
      </Table.Tr>
    </>
  );
}

function Tresorerie({ data }: { data: PrevisionBudget }) {
  const t = data.tresorerie;
  const reel = data.realise;
  return (
    <Paper withBorder p="md">
      <Title order={4} mb="sm">
        BUDGET DE TRÉSORERIE
      </Title>
      <Table.ScrollContainer minWidth={1300}>
        <Table withColumnBorders withTableBorder fz="sm">
          <Entete couleur={BLEU} premiere="Postes" colonnes={data.colonnes} derniere="Total bénéfice" />
          <Table.Tbody>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Encaissements</Table.Td>
              <Montants valeurs={t.encaissements} total={t.totalEncaissements} />
            </Table.Tr>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Décaissements</Table.Td>
              <Montants valeurs={t.decaissements} total={t.totalDecaissements} />
            </Table.Tr>
            <Table.Tr fw={700}>
              <Table.Td {...PREMIERE}>Flux de trésorerie</Table.Td>
              <Montants valeurs={t.flux} total={t.benefice} rouge />
            </Table.Tr>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Trésorerie initiale</Table.Td>
              {t.initiale.map((v, i) => (
                <Table.Td key={i} ta="right" c={v < 0 ? 'red' : undefined}>
                  {fmt(v)}
                </Table.Td>
              ))}
              <Table.Td />
            </Table.Tr>
            <Table.Tr fw={700}>
              <Table.Td {...PREMIERE}>Trésorerie finale</Table.Td>
              <Montants valeurs={t.finale} total={t.benefice} rouge fondTotal={JAUNE} />
            </Table.Tr>
            <Table.Tr bg={GRIS_CLAIR}>
              <Table.Td colSpan={data.colonnes.length + 2} ta="center" fw={700}>
                Réalisé (paiements, salaires et dépenses enregistrés)
              </Table.Td>
            </Table.Tr>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Encaissements réels</Table.Td>
              <Montants valeurs={reel.encaissements} total={reel.totalEncaissements} />
            </Table.Tr>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Décaissements réels</Table.Td>
              <Montants valeurs={reel.decaissements} total={reel.totalDecaissements} />
            </Table.Tr>
            <Table.Tr>
              <Table.Td {...PREMIERE}>Écart encaissements</Table.Td>
              {reel.ecartEncaissements.map((v, i) => (
                <Table.Td key={i} ta="right" c={v > 0 ? 'green' : v < 0 ? 'red' : undefined}>
                  {v > 0 ? '+' : ''}
                  {fmt(v)}
                </Table.Td>
              ))}
              <Table.Td />
            </Table.Tr>
            <Table.Tr fw={700}>
              <Table.Td {...PREMIERE}>Trésorerie finale réelle</Table.Td>
              <Montants valeurs={reel.finale} total={reel.totalEncaissements - reel.totalDecaissements} rouge />
            </Table.Tr>
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <Text size="xs" c="dimmed" mt="xs">
        FT = E − D · TI = TF du mois précédent (0 en octobre) · TF = TI + FT. Réalisé : ce qui est encaissé avant
        octobre compte en octobre, après juin en « Bilan (vacances) ». Écart = réel − prévu.
      </Text>
    </Paper>
  );
}

function ModalPoste({
  poste,
  colonnes,
  anneeScolaireId,
  onClose,
  onSucces,
}: {
  poste: PosteBudget | null;
  colonnes: string[];
  anneeScolaireId: string;
  onClose: () => void;
  onSucces: () => void;
}) {
  const [nom, setNom] = useState(poste?.poste ?? '');
  const [montants, setMontants] = useState<number[]>(poste?.montants ?? colonnes.map(() => 0));
  const [code, setCode] = useState('');

  const terminer = (message: string) => {
    notifications.show({ message, color: 'green' });
    onSucces();
    onClose();
  };
  const enregistrer = useMutation({
    mutationFn: () =>
      poste
        ? modifierPosteBudget(poste.id, { poste: nom, montants }, code)
        : ajouterPosteBudget({ anneeScolaireId, poste: nom, montants }),
    onSuccess: () => terminer(poste ? 'Dépense modifiée' : 'Dépense ajoutée'),
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement"),
  });
  const supprimer = useMutation({
    mutationFn: () => supprimerPosteBudget(poste!.id, code),
    onSuccess: () => terminer('Dépense supprimée'),
    onError: (e) => erreur(e, 'Erreur lors de la suppression'),
  });

  // Octobre recopié sur les mois scolaires (pas sur les vacances)
  const recopier = () => setMontants((m) => m.map((v, i) => (i < colonnes.length - 1 ? m[0] : v)));

  return (
    <Modal opened onClose={onClose} title={poste ? `Modifier « ${poste.poste} »` : 'Ajouter une dépense'} size="lg">
      <Stack>
        <TextInput label="Poste" value={nom} onChange={(e) => setNom(e.currentTarget.value)} required />
        <SimpleGrid cols={{ base: 2, sm: 3 }}>
          {colonnes.map((c, i) => (
            <NumberInput
              key={c}
              label={libelleColonne(c)}
              value={montants[i]}
              min={0}
              thousandSeparator=" "
              allowNegative={false}
              onChange={(v) => setMontants((m) => m.map((x, k) => (k === i ? (typeof v === 'number' ? v : 0) : x)))}
            />
          ))}
        </SimpleGrid>
        <Group>
          <Button variant="subtle" size="xs" onClick={recopier}>
            Recopier octobre jusqu'à juin
          </Button>
        </Group>
        {poste && (
          <PasswordInput
            label="Code"
            description="Code des dépenses, demandé pour modifier ou supprimer"
            value={code}
            onChange={(e) => setCode(e.currentTarget.value)}
          />
        )}
        <Group justify="space-between">
          {poste ? (
            <Button color="red" variant="light" disabled={!code} loading={supprimer.isPending} onClick={() => supprimer.mutate()}>
              Supprimer
            </Button>
          ) : (
            <span />
          )}
          <Button
            disabled={!nom.trim() || (poste !== null && !code)}
            loading={enregistrer.isPending}
            onClick={() => enregistrer.mutate()}
          >
            Enregistrer
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
