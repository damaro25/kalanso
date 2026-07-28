import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Group,
  Select,
  Button,
  Table,
  Badge,
  Stack,
  Modal,
  NumberInput,
  TextInput,
  Text,
  Divider,
  List,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye, IconUpload, IconFileSpreadsheet } from '@tabler/icons-react';
import {
  fetchBulletinsPaie,
  createBulletinPaie,
  validerBulletinPaie,
  ouvrirBulletinPaiePdf,
  telechargerCahierPaie,
  importBulletinsPaie,
  telechargerModelePaie,
  type StatutBulletinPaie,
  type ImportResultat,
} from '../../api/paie';
import { fetchPersonnel, fetchSalaireEnseignant } from '../../api/personnel';

const MOIS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
].map((label, i) => ({ value: String(i + 1), label }));

const ANNEE_COURANTE = new Date().getFullYear();
const ANNEES = [ANNEE_COURANTE - 1, ANNEE_COURANTE, ANNEE_COURANTE + 1].map((a) => ({ value: String(a), label: String(a) }));

const STATUT_COLORS: Record<StatutBulletinPaie, string> = { BROUILLON: 'gray', VALIDE: 'blue', PAYE: 'green' };

// Lignes standard du bulletin (alignées sur le modèle de La Cible du Formateur)
interface LigneEdit {
  libelle: string;
  sens: 'GAIN' | 'RETENUE';
  imposable: boolean;
  montant: number | '';
}

// Le salaire de base est ajouté automatiquement par le serveur (calculé pour
// l'enseignant, fixe pour l'administratif). On ne saisit ici que les lignes additionnelles.
const LIGNES_DEFAUT: LigneEdit[] = [
  { libelle: 'Indemnité', sens: 'GAIN', imposable: false, montant: '' },
  { libelle: 'Prime', sens: 'GAIN', imposable: true, montant: '' },
  { libelle: 'Écolage', sens: 'RETENUE', imposable: false, montant: '' },
  { libelle: 'Cotisation sociale', sens: 'RETENUE', imposable: true, montant: '' },
  { libelle: 'Avance sur salaire', sens: 'RETENUE', imposable: false, montant: '' },
];

export function PaiePage() {
  const queryClient = useQueryClient();
  const [mois, setMois] = useState<string | null>(String(new Date().getMonth() + 1));
  const [annee, setAnnee] = useState<string | null>(String(ANNEE_COURANTE));

  const { data: bulletins, isLoading } = useQuery({
    queryKey: ['bulletins-paie', mois, annee],
    queryFn: () => fetchBulletinsPaie(Number(mois), Number(annee)),
    enabled: !!mois && !!annee,
  });
  const { data: personnel } = useQuery({ queryKey: ['personnel'], queryFn: fetchPersonnel });

  const [modalOuvert, setModalOuvert] = useState(false);
  const [personnelId, setPersonnelId] = useState<string | null>(null);
  const [nombreHeures, setNombreHeures] = useState<number | ''>('');
  const [modePaiement, setModePaiement] = useState('Billetage');
  const [lignes, setLignes] = useState<LigneEdit[]>(LIGNES_DEFAUT);
  // Heures saisies pour le mois, par affectation (enseignant).
  const [heuresParClasse, setHeuresParClasse] = useState<Record<string, number>>({});

  function reset() {
    setPersonnelId(null);
    setNombreHeures('');
    setModePaiement('Billetage');
    setLignes(LIGNES_DEFAUT.map((l) => ({ ...l })));
    setHeuresParClasse({});
  }

  const employeSelectionne = (personnel ?? []).find((p) => p.id === personnelId);
  const estEnseignant = employeSelectionne?.type === 'ENSEIGNANT';

  const { data: salaireEns } = useQuery({
    queryKey: ['salaire-enseignant', personnelId],
    queryFn: () => fetchSalaireEnseignant(personnelId!),
    enabled: !!personnelId && estEnseignant,
  });

  // Pré-remplir les heures par classe avec les valeurs déduites de l'emploi du
  // temps réel (heures hebdomadaires × 4) quand on choisit un enseignant.
  useEffect(() => {
    if (salaireEns) {
      const initial: Record<string, number> = {};
      for (const l of salaireEns.lignes) initial[`${l.classeId}|${l.matiereId}`] = l.heuresParMois;
      setHeuresParClasse(initial);
    }
  }, [salaireEns]);

  // Base = Σ (heures saisies × taux) pour un enseignant ; salaire fixe pour l'administratif.
  const baseAuto = estEnseignant
    ? (salaireEns?.lignes ?? []).reduce(
        (acc, l) => acc + (heuresParClasse[`${l.classeId}|${l.matiereId}`] ?? 0) * l.tauxHoraire,
        0,
      )
    : Number(employeSelectionne?.salaireBase ?? 0);

  const totalHeuresSaisies = (salaireEns?.lignes ?? []).reduce(
    (acc, l) => acc + (heuresParClasse[`${l.classeId}|${l.matiereId}`] ?? 0),
    0,
  );

  // Total d'heures « normal » d'après l'emploi du temps réel (avant tout
  // ajustement). Sert de référence pour répartir un ajustement global.
  const totalHeuresDefaut = (salaireEns?.lignes ?? []).reduce((acc, l) => acc + l.heuresParMois, 0);

  // Un enseignant peut avoir un empêchement (maladie, absence...) et ne pas
  // atteindre son volume d'heures habituel un mois donné. Plutôt que de
  // corriger chaque classe une par une, on ajuste le total et on répartit la
  // baisse (ou hausse) au prorata sur chaque ligne, en gardant les mêmes
  // proportions entre classes.
  function ajusterTotalHeures(nouveauTotal: number) {
    if (totalHeuresDefaut <= 0) return;
    const echelle = nouveauTotal / totalHeuresDefaut;
    const ajuste: Record<string, number> = {};
    for (const l of salaireEns?.lignes ?? []) {
      ajuste[`${l.classeId}|${l.matiereId}`] = Math.round(l.heuresParMois * echelle * 10) / 10;
    }
    setHeuresParClasse(ajuste);
  }

  const totalGains =
    baseAuto + lignes.filter((l) => l.sens === 'GAIN').reduce((a, l) => a + (l.montant || 0), 0);
  const totalRetenues = lignes.filter((l) => l.sens === 'RETENUE').reduce((a, l) => a + (l.montant || 0), 0);
  const net = totalGains - totalRetenues;

  const createMutation = useMutation({
    mutationFn: () =>
      createBulletinPaie({
        personnelId: personnelId!,
        mois: Number(mois),
        annee: Number(annee),
        nombreHeures: nombreHeures === '' ? undefined : Number(nombreHeures),
        modePaiement: modePaiement || undefined,
        heuresParClasse: estEnseignant
          ? Object.entries(heuresParClasse).map(([cle, heures]) => {
              const [classeId, matiereId] = cle.split('|');
              return { classeId, matiereId, heures };
            })
          : undefined,
        lignes: lignes
          .filter((l) => l.montant !== '' && Number(l.montant) > 0)
          .map((l) => ({
            libelle: l.libelle,
            imposable: l.imposable,
            montantGain: l.sens === 'GAIN' ? Number(l.montant) : 0,
            montantRetenue: l.sens === 'RETENUE' ? Number(l.montant) : 0,
          })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-paie'] });
      notifications.show({ message: 'Bulletin de salaire créé', color: 'green' });
      setModalOuvert(false);
      reset();
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  const validerMutation = useMutation({
    mutationFn: (id: string) => validerBulletinPaie(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-paie'] });
      notifications.show({ message: 'Bulletin validé', color: 'green' });
    },
    onError: (error: any) => notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  // Import Excel
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [resultatImport, setResultatImport] = useState<ImportResultat | null>(null);

  const importMutation = useMutation({
    mutationFn: (fichier: File) => importBulletinsPaie(fichier),
    onSuccess: (resultat) => {
      queryClient.invalidateQueries({ queryKey: ['bulletins-paie'] });
      notifications.show({
        message: `${resultat.creees} bulletin(s) créé(s) en brouillon${resultat.erreurs.length > 0 ? `, ${resultat.erreurs.length} ligne(s) ignorée(s)` : ''}`,
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

  const masseSalarialeValidee = (bulletins ?? [])
    .filter((b) => b.statut !== 'BROUILLON')
    .reduce((a, b) => a + Number(b.netAPayer), 0);
  const masseSalarialeBrouillon = (bulletins ?? [])
    .filter((b) => b.statut === 'BROUILLON')
    .reduce((a, b) => a + Number(b.netAPayer), 0);

  return (
    <Stack>
      <Title order={2}>Paie du personnel</Title>

      <Group>
        <Select data={MOIS} value={mois} onChange={setMois} w={150} />
        <Select data={ANNEES} value={annee} onChange={setAnnee} w={110} />
        <Button onClick={() => { reset(); setModalOuvert(true); }}>Nouveau bulletin</Button>
        {bulletins && bulletins.length > 0 && (
          <Button
            variant="light"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() => telechargerCahierPaie(Number(mois), Number(annee))}
          >
            Télécharger le cahier de paie
          </Button>
        )}
        <input ref={fileInputRef} type="file" accept=".xlsx" hidden onChange={onFichierChoisi} />
        <Button
          variant="light"
          leftSection={<IconUpload size={16} stroke={1.5} />}
          loading={importMutation.isPending}
          onClick={() => fileInputRef.current?.click()}
        >
          Importer (Excel)
        </Button>
        <Button
          variant="subtle"
          size="sm"
          leftSection={<IconFileSpreadsheet size={16} stroke={1.5} />}
          onClick={() => telechargerModelePaie()}
        >
          Modèle d'import
        </Button>
      </Group>

      {isLoading && <p>Chargement...</p>}
      {bulletins && bulletins.length === 0 && <Text c="dimmed">Aucun bulletin pour ce mois.</Text>}

      {bulletins && bulletins.length > 0 && (
        <>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Matricule</Table.Th>
                <Table.Th>Employé</Table.Th>
                <Table.Th>Gains</Table.Th>
                <Table.Th>Retenues</Table.Th>
                <Table.Th>Net à payer</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {bulletins.map((b) => (
                <Table.Tr key={b.id}>
                  <Table.Td>{b.personnel.matricule ?? '—'}</Table.Td>
                  <Table.Td>{b.personnel.prenom} {b.personnel.nom}</Table.Td>
                  <Table.Td>{Number(b.totalGains).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td>{Number(b.totalRetenues).toLocaleString('fr-FR')}</Table.Td>
                  <Table.Td>
                    <strong>{Number(b.netAPayer).toLocaleString('fr-FR')} GNF</strong>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={STATUT_COLORS[b.statut]}>{b.statut}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconEye size={14} stroke={1.5} />}
                        onClick={() => ouvrirBulletinPaiePdf(b.id)}
                      >
                        Voir le bulletin
                      </Button>
                      {b.statut === 'BROUILLON' && (
                        <Button
                          size="xs"
                          color="blue"
                          loading={validerMutation.isPending}
                          onClick={() => validerMutation.mutate(b.id)}
                        >
                          Valider
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
          <Text fw={700}>Masse salariale validée (net) : {masseSalarialeValidee.toLocaleString('fr-FR')} GNF</Text>
          {masseSalarialeBrouillon > 0 && (
            <Text size="sm" c="dimmed">
              + {masseSalarialeBrouillon.toLocaleString('fr-FR')} GNF en brouillon (non comptés dans le module Finance
              tant qu'ils ne sont pas validés)
            </Text>
          )}
        </>
      )}

      <Modal opened={modalOuvert} onClose={() => setModalOuvert(false)} title="Nouveau bulletin de salaire" size="lg">
        <Stack>
          <Select
            label="Employé"
            placeholder="Choisir un membre du personnel"
            required
            data={(personnel ?? []).map((p) => ({ value: p.id, label: `${p.prenom} ${p.nom} (${p.fonction})` }))}
            value={personnelId}
            onChange={setPersonnelId}
          />
          {!estEnseignant && (
            <Group grow>
              <NumberInput label="Nombre d'heures" value={nombreHeures} onChange={(v) => setNombreHeures(v === '' ? '' : Number(v))} />
              <TextInput label="Mode de paiement" value={modePaiement} onChange={(e) => setModePaiement(e.currentTarget.value)} />
            </Group>
          )}

          {estEnseignant && (
            <>
              <TextInput label="Mode de paiement" value={modePaiement} onChange={(e) => setModePaiement(e.currentTarget.value)} />
              <Divider label="Heures dispensées ce mois (par classe)" />
              {(salaireEns?.lignes ?? []).length === 0 && (
                <Text size="sm" c="dimmed">
                  Cet enseignant n'a pas encore de créneau dans l'emploi du temps. Ajoutez-en depuis la page Emploi du
                  temps.
                </Text>
              )}
              {totalHeuresDefaut > 0 && (
                <NumberInput
                  label="Total heures ce mois"
                  description={`Normalement ${totalHeuresDefaut} h/mois d'après l'emploi du temps — à réduire en cas d'empêchement (maladie, absence...) ce mois-ci`}
                  min={0}
                  suffix=" h"
                  value={totalHeuresSaisies}
                  onChange={(v) => ajusterTotalHeures(v === '' ? 0 : Number(v))}
                />
              )}
              {(salaireEns?.lignes ?? []).map((l) => {
                const cle = `${l.classeId}|${l.matiereId}`;
                return (
                  <Group key={cle} justify="space-between">
                    <Text size="sm" w={260}>
                      {l.classe} — {l.matiere}{' '}
                      <Text span size="xs" c="dimmed">
                        ({l.tauxHoraire.toLocaleString('fr-FR')} GNF/h)
                      </Text>
                    </Text>
                    <NumberInput
                      w={110}
                      min={0}
                      suffix=" h"
                      value={heuresParClasse[cle] ?? 0}
                      onChange={(v) => setHeuresParClasse((prev) => ({ ...prev, [cle]: v === '' ? 0 : Number(v) }))}
                    />
                    <Text size="sm" w={120} ta="right">
                      {((heuresParClasse[cle] ?? 0) * l.tauxHoraire).toLocaleString('fr-FR')} GNF
                    </Text>
                  </Group>
                );
              })}
            </>
          )}

          {employeSelectionne && (
            <Group justify="space-between" p="xs" style={{ background: 'var(--mantine-color-gray-0)', borderRadius: 6 }}>
              <Text size="sm">
                Salaire de base{' '}
                <Badge size="xs" color={estEnseignant ? 'indigo' : 'gray'}>
                  {estEnseignant ? `enseignant · ${totalHeuresSaisies} h` : 'administratif'}
                </Badge>{' '}
                <Text span size="xs" c="dimmed">(ajouté automatiquement)</Text>
              </Text>
              <Text fw={600}>{baseAuto.toLocaleString('fr-FR')} GNF</Text>
            </Group>
          )}
          {estEnseignant && baseAuto === 0 && (
            <Text size="xs" c="orange">
              Saisissez les heures dispensées ce mois (et vérifiez les taux sur la fiche de l'enseignant) : la base est
              actuellement à 0.
            </Text>
          )}

          <Divider label="Lignes additionnelles" />
          {lignes.map((ligne, i) => (
            <Group key={ligne.libelle} justify="space-between">
              <Text w={180}>
                {ligne.libelle}{' '}
                <Badge size="xs" color={ligne.sens === 'GAIN' ? 'green' : 'red'}>
                  {ligne.sens === 'GAIN' ? 'gain' : 'retenue'}
                </Badge>
              </Text>
              <NumberInput
                placeholder="Montant (GNF)"
                value={ligne.montant}
                onChange={(v) =>
                  setLignes((prev) => prev.map((l, j) => (j === i ? { ...l, montant: v === '' ? '' : Number(v) } : l)))
                }
                w={180}
                min={0}
              />
            </Group>
          ))}

          <Divider />
          <Group justify="space-between">
            <Text>Total gains : {totalGains.toLocaleString('fr-FR')} GNF</Text>
            <Text>Total retenues : {totalRetenues.toLocaleString('fr-FR')} GNF</Text>
          </Group>
          <Text fw={700} c={net < 0 ? 'red' : 'green'}>
            Net à payer : {net.toLocaleString('fr-FR')} GNF
          </Text>

          <Button
            disabled={!personnelId || totalGains <= 0 || net < 0}
            loading={createMutation.isPending}
            onClick={() => createMutation.mutate()}
          >
            Créer le bulletin
          </Button>
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
