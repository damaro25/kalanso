import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Group,
  Button,
  SimpleGrid,
  Paper,
  Text,
  Stack,
  Table,
  Badge,
  SegmentedControl,
  Progress,
  Modal,
  Select,
  TextInput,
  NumberInput,
  Anchor,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconRefresh } from '@tabler/icons-react';
import { confirmerSuppression } from '../../lib/confirm';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';
import {
  fetchFinanceDashboard,
  fetchRecettesParMois,
  fetchSalairesParMois,
  fetchRecouvrementParClasse,
  fetchElevesFinance,
  fetchCompteResultatParMois,
  fetchMouvements,
  creerMouvement,
  supprimerMouvement,
  telechargerBilanFinancier,
  regenererFactures,
  type TypeMouvement,
} from '../../api/finance';

const CATEGORIES_DEPENSE = ['Loyer', 'Fournitures', 'Équipement', 'Maintenance', 'Eau / Électricité', 'Transport', 'Impôts & taxes', 'Autre'];
const CATEGORIES_RECETTE = ['Cantine', 'Transport', 'Vente fournitures', 'Don / Subvention', 'Autre'];

const ANNEE = new Date().getFullYear();

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

function KpiCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {value}
      </Text>
      {sub && (
        <Text size="xs" c="dimmed">
          {sub}
        </Text>
      )}
    </Paper>
  );
}

export function FinancePage() {
  const queryClient = useQueryClient();
  const [filtreEleves, setFiltreEleves] = useState<'EN_RETARD' | 'A_JOUR'>('EN_RETARD');

  const { data: dash, isLoading } = useQuery({ queryKey: ['finance-dashboard'], queryFn: () => fetchFinanceDashboard() });
  const { data: recettes } = useQuery({ queryKey: ['finance-recettes', ANNEE], queryFn: () => fetchRecettesParMois(ANNEE) });
  const { data: salaires } = useQuery({ queryKey: ['finance-salaires', ANNEE], queryFn: () => fetchSalairesParMois(ANNEE) });
  const { data: recouvrement } = useQuery({ queryKey: ['finance-recouvrement'], queryFn: () => fetchRecouvrementParClasse() });
  const { data: eleves } = useQuery({
    queryKey: ['finance-eleves', filtreEleves],
    queryFn: () => fetchElevesFinance(filtreEleves),
  });
  const { data: cr } = useQuery({ queryKey: ['finance-cr', ANNEE], queryFn: () => fetchCompteResultatParMois(ANNEE) });
  const { data: mouvements } = useQuery({ queryKey: ['finance-mouvements', ANNEE], queryFn: () => fetchMouvements(ANNEE) });

  // Modal ajout de mouvement
  const [modalOuvert, setModalOuvert] = useState(false);
  const [type, setType] = useState<TypeMouvement>('DEPENSE');
  const [categorie, setCategorie] = useState<string | null>('Loyer');
  const [libelle, setLibelle] = useState('');
  const [montant, setMontant] = useState<number | ''>('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  function invalider() {
    queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] });
    queryClient.invalidateQueries({ queryKey: ['finance-cr'] });
    queryClient.invalidateQueries({ queryKey: ['finance-mouvements'] });
  }

  const creerMutation = useMutation({
    mutationFn: () =>
      creerMouvement({ type, categorie: categorie ?? 'Autre', libelle, montant: Number(montant), date }),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Mouvement enregistré', color: 'green' });
      setModalOuvert(false);
      setLibelle('');
      setMontant('');
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const supprimerMutation = useMutation({
    mutationFn: (id: string) => supprimerMouvement(id),
    onSuccess: () => {
      invalider();
      notifications.show({ message: 'Mouvement supprimé', color: 'green' });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors de la suppression', color: 'red' }),
  });

  const regenererMutation = useMutation({
    mutationFn: regenererFactures,
    onSuccess: (result) => {
      invalider();
      queryClient.invalidateQueries({ queryKey: ['finance-recouvrement'] });
      queryClient.invalidateQueries({ queryKey: ['finance-eleves'] });
      notifications.show({
        message: `Factures vérifiées pour ${result.eleveTraites} élève(s) inscrit(s) — celles manquantes ont été générées`,
        color: 'green',
      });
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  if (isLoading || !dash) return <p>Chargement...</p>;

  const categories = type === 'DEPENSE' ? CATEGORIES_DEPENSE : CATEGORIES_RECETTE;

  return (
    <Stack>
      <Group justify="space-between">
        <div>
          <Title order={2}>Finance</Title>
          <Text c="dimmed" size="sm">
            Année scolaire {dash.anneeScolaire.libelle}
          </Text>
        </div>
        <Group>
          <Button
            variant="light"
            leftSection={<IconRefresh size={16} stroke={1.5} />}
            loading={regenererMutation.isPending}
            onClick={() => regenererMutation.mutate()}
          >
            Régénérer les factures manquantes
          </Button>
          <Button variant="light" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerBilanFinancier(ANNEE)}>
            Télécharger le bilan financier
          </Button>
        </Group>
      </Group>

      {/* KPIs écolage / trésorerie */}
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <KpiCard label="Total facturé (écolage)" value={`${fmt(dash.ecolage.totalFacture)} GNF`} />
        <KpiCard label="Encaissé" value={`${fmt(dash.ecolage.totalEncaisse)} GNF`} color="green" />
        <KpiCard label="Reste à payer" value={`${fmt(dash.ecolage.totalRestant)} GNF`} color={dash.ecolage.totalRestant > 0 ? 'red' : 'green'} />
        <KpiCard
          label="Solde net"
          value={`${fmt(dash.soldeNet)} GNF`}
          color={dash.soldeNet >= 0 ? 'green' : 'red'}
          sub="encaissé − salaires cumulés"
        />
      </SimpleGrid>

      {/* KPIs frais d'inscription */}
      <SimpleGrid cols={{ base: 2, md: 4 }}>
        <KpiCard label="Total facturé (inscription)" value={`${fmt(dash.inscription.totalFacture)} GNF`} />
        <KpiCard label="Encaissé" value={`${fmt(dash.inscription.totalEncaisse)} GNF`} color="green" />
        <KpiCard
          label="Reste à payer"
          value={`${fmt(dash.inscription.totalRestant)} GNF`}
          color={dash.inscription.totalRestant > 0 ? 'red' : 'green'}
        />
        <KpiCard label="Taux de recouvrement" value={`${dash.inscription.tauxRecouvrement} %`} />
      </SimpleGrid>

      {/* Taux de recouvrement + élèves */}
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Taux de recouvrement
          </Text>
          <Text fw={700} size="xl">
            {dash.ecolage.tauxRecouvrement} %
          </Text>
          <Progress value={dash.ecolage.tauxRecouvrement} mt="xs" color={dash.ecolage.tauxRecouvrement >= 80 ? 'green' : dash.ecolage.tauxRecouvrement >= 50 ? 'yellow' : 'red'} />
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed" mb="xs">
            Élèves inscrits : {dash.eleves.nbInscrits}
          </Text>
          <Group>
            <Badge color="green" size="lg">À jour : {dash.eleves.nbAJour}</Badge>
            <Badge color="red" size="lg">En retard : {dash.eleves.nbEnRetard}</Badge>
            <Badge color="gray" size="lg">Sans facture : {dash.eleves.nbSansFacture}</Badge>
          </Group>
        </Paper>
      </SimpleGrid>

      {/* KPIs salaires */}
      <SimpleGrid cols={{ base: 2, md: 3 }}>
        <KpiCard label={`Masse salariale (${dash.moisCourant})`} value={`${fmt(dash.salaires.masseSalarialeMois)} GNF`} color="grape" />
        <KpiCard label={`Salaires cumulés (${dash.anneeCivile})`} value={`${fmt(dash.salaires.masseSalarialeCumul)} GNF`} color="grape" />
        <KpiCard label={`Recettes ${ANNEE}`} value={`${fmt(recettes?.total ?? 0)} GNF`} color="green" />
      </SimpleGrid>

      {/* COMPTE DE RÉSULTAT */}
      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Compte de résultat ({ANNEE})
        </Title>
        <SimpleGrid cols={{ base: 1, md: 3 }}>
          <div>
            <Text size="sm" c="dimmed">Recettes totales</Text>
            <Text fw={700} c="green">{fmt(dash.compteResultat.recettesTotales)} GNF</Text>
            <Text size="xs" c="dimmed">
              écolage {fmt(dash.compteResultat.ecolageEncaisse)} + inscription {fmt(dash.compteResultat.inscriptionEncaisse)} + autres{' '}
              {fmt(dash.compteResultat.autresRecettes)}
            </Text>
          </div>
          <div>
            <Text size="sm" c="dimmed">Dépenses totales</Text>
            <Text fw={700} c="red">{fmt(dash.compteResultat.depensesTotales)} GNF</Text>
            <Text size="xs" c="dimmed">salaires {fmt(dash.compteResultat.depensesSalaires)} + autres {fmt(dash.compteResultat.depensesAutres)}</Text>
          </div>
          <div>
            <Text size="sm" c="dimmed">Résultat net</Text>
            <Text fw={700} size="xl" c={dash.compteResultat.resultatNet >= 0 ? 'green' : 'red'}>
              {fmt(dash.compteResultat.resultatNet)} GNF
            </Text>
            <Text size="xs" c="dimmed">{dash.compteResultat.resultatNet >= 0 ? 'Bénéfice' : 'Déficit'}</Text>
          </div>
        </SimpleGrid>
      </Paper>

      {/* Graphe recettes vs dépenses par mois */}
      <Paper withBorder p="md" h={320}>
        <Title order={4} mb="sm">
          Recettes vs Dépenses par mois ({ANNEE})
        </Title>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={cr?.parMois ?? []}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="libelle" tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip formatter={(v) => `${fmt(Number(v))} GNF`} />
            <Legend />
            <Bar dataKey="recettes" fill="#2f9e44" name="Recettes" />
            <Bar dataKey="depenses" fill="#e03131" name="Dépenses" />
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      {/* Registre des mouvements (dépenses / autres recettes) */}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Dépenses & autres recettes</Title>
          <Button size="xs" onClick={() => setModalOuvert(true)}>
            Enregistrer un mouvement
          </Button>
        </Group>
        {(mouvements?.length ?? 0) === 0 && <Text c="dimmed">Aucun mouvement enregistré.</Text>}
        {mouvements && mouvements.length > 0 && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Date</Table.Th>
                <Table.Th>Type</Table.Th>
                <Table.Th>Catégorie</Table.Th>
                <Table.Th>Libellé</Table.Th>
                <Table.Th>Montant</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {mouvements.map((m) => (
                <Table.Tr key={m.id}>
                  <Table.Td>{new Date(m.date).toLocaleDateString('fr-FR')}</Table.Td>
                  <Table.Td>
                    <Badge color={m.type === 'RECETTE' ? 'green' : 'red'}>
                      {m.type === 'RECETTE' ? 'Recette' : 'Dépense'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>{m.categorie}</Table.Td>
                  <Table.Td>{m.libelle}</Table.Td>
                  <Table.Td c={m.type === 'RECETTE' ? 'green' : 'red'}>{fmt(Number(m.montant))} GNF</Table.Td>
                  <Table.Td>
                    <Anchor
                      component="button"
                      type="button"
                      c="red"
                      onClick={() =>
                        confirmerSuppression({
                          message: `Voulez-vous vraiment supprimer le mouvement « ${m.libelle} » (${fmt(Number(m.montant))} GNF) ? Cette action est définitive.`,
                          onConfirm: () => supprimerMutation.mutate(m.id),
                        })
                      }
                    >
                      Supprimer
                    </Anchor>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Graphe recettes par mois */}
      <Paper withBorder p="md" h={320}>
        <Title order={4} mb="sm">
          Recettes encaissées par mois ({ANNEE})
        </Title>
        <ResponsiveContainer width="100%" height="85%">
          <BarChart data={recettes?.parMois ?? []}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="libelle" tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip formatter={(v) => `${fmt(Number(v))} GNF`} />
            <Bar dataKey="montant" fill="#2f9e44" name="Recettes" />
          </BarChart>
        </ResponsiveContainer>
      </Paper>

      {/* Graphe salaires par mois + cumul */}
      <Paper withBorder p="md" h={320}>
        <Title order={4} mb="sm">
          Masse salariale par mois et cumulée ({ANNEE})
        </Title>
        <ResponsiveContainer width="100%" height="85%">
          <LineChart data={salaires?.parMois ?? []}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="libelle" tickFormatter={(v: string) => v.slice(0, 3)} />
            <YAxis tickFormatter={(v: number) => `${v / 1000}k`} />
            <Tooltip formatter={(v) => `${fmt(Number(v))} GNF`} />
            <Legend />
            <Line type="monotone" dataKey="montant" stroke="#ae3ec9" name="Mensuel" strokeWidth={2} />
            <Line type="monotone" dataKey="cumul" stroke="#7048e8" name="Cumul" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Paper>

      {/* Recouvrement par classe */}
      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Recouvrement par classe
        </Title>
        {(recouvrement?.classes.length ?? 0) === 0 && <Text c="dimmed">Aucune donnée.</Text>}
        {recouvrement && recouvrement.classes.length > 0 && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Classe</Table.Th>
                <Table.Th>Élèves</Table.Th>
                <Table.Th>Facturé</Table.Th>
                <Table.Th>Encaissé</Table.Th>
                <Table.Th>Reste</Table.Th>
                <Table.Th>Taux</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {recouvrement.classes.map((c) => (
                <Table.Tr key={c.classeId}>
                  <Table.Td>{c.classe}</Table.Td>
                  <Table.Td>{c.nbEleves}</Table.Td>
                  <Table.Td>{fmt(c.totalFacture)}</Table.Td>
                  <Table.Td>{fmt(c.totalPaye)}</Table.Td>
                  <Table.Td c={c.totalRestant > 0 ? 'red' : undefined}>{fmt(c.totalRestant)}</Table.Td>
                  <Table.Td>
                    <Badge color={c.taux >= 80 ? 'green' : c.taux >= 50 ? 'yellow' : 'red'}>{c.taux}%</Badge>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      {/* Liste élèves par statut de paiement */}
      <Paper withBorder p="md">
        <Group justify="space-between" mb="sm">
          <Title order={4}>Élèves</Title>
          <SegmentedControl
            value={filtreEleves}
            onChange={(v) => setFiltreEleves(v as 'EN_RETARD' | 'A_JOUR')}
            data={[
              { label: 'En retard', value: 'EN_RETARD' },
              { label: 'À jour', value: 'A_JOUR' },
            ]}
          />
        </Group>
        {(eleves?.eleves.length ?? 0) === 0 && <Text c="dimmed">Aucun élève dans cette catégorie.</Text>}
        {eleves && eleves.eleves.length > 0 && (
          <Table striped>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élève</Table.Th>
                <Table.Th>Classe</Table.Th>
                <Table.Th>Facturé</Table.Th>
                <Table.Th>Payé</Table.Th>
                <Table.Th>Reste</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {eleves.eleves.map((e) => (
                <Table.Tr key={e.eleveId}>
                  <Table.Td>
                    {e.prenom} {e.nom}
                  </Table.Td>
                  <Table.Td>{e.classe}</Table.Td>
                  <Table.Td>{fmt(e.totalFacture)}</Table.Td>
                  <Table.Td>{fmt(e.totalPaye)}</Table.Td>
                  <Table.Td c={e.reste > 0 ? 'red' : 'green'}>{fmt(e.reste)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}
      </Paper>

      <Modal opened={modalOuvert} onClose={() => setModalOuvert(false)} title="Enregistrer un mouvement financier">
        <Stack>
          <SegmentedControl
            value={type}
            onChange={(v) => {
              setType(v as TypeMouvement);
              setCategorie(v === 'DEPENSE' ? 'Loyer' : 'Cantine');
            }}
            data={[
              { label: 'Dépense', value: 'DEPENSE' },
              { label: 'Recette', value: 'RECETTE' },
            ]}
          />
          <Select label="Catégorie" data={categories} value={categorie} onChange={setCategorie} />
          <TextInput label="Libellé" value={libelle} onChange={(e) => setLibelle(e.currentTarget.value)} />
          <NumberInput label="Montant (GNF)" min={0} value={montant} onChange={(v) => setMontant(v === '' ? '' : Number(v))} />
          <TextInput label="Date" type="date" value={date} onChange={(e) => setDate(e.currentTarget.value)} />
          <Button
            disabled={!categorie || !libelle || montant === '' || Number(montant) <= 0}
            loading={creerMutation.isPending}
            onClick={() => creerMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
