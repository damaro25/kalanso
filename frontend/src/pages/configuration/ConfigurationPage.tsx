import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert,
  Button,
  FileButton,
  Group,
  NumberInput,
  Paper,
  Select,
  SimpleGrid,
  Stack,
  Table,
  Tabs,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { modals } from '@mantine/modals';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconInfoCircle, IconUpload } from '@tabler/icons-react';
import { ImportGrilleModal } from './ImportGrilleModal';
import { ImportCoordonneesModal } from './ImportCoordonneesModal';
import { useLogoEcole, logoParDefaut } from '../../lib/nomEcole';
import { useAuth } from '../../auth/AuthContext';
import { fetchAnneesScolaires, libelleAnnee } from '../../api/classes';
import { REGIMES } from '../../api/finances';
import { FormationsSupplementaires } from './FormationsSupplementaires';
import { AssuranceConfiguration } from './AssuranceConfiguration';
import { SynchronisationConfiguration } from './SynchronisationConfiguration';
import {
  chargerModeleMameTa,
  enregistrerGrille,
  fetchEcoleConfiguration,
  fetchGrille,
  telechargerGrille,
  telechargerCoordonnees,
  envoyerLogo,
  retirerLogo,
  updateEcoleConfiguration,
  type Grille,
  type GrilleNiveau,
  type GrilleRegime,
  type Tranches,
  type UpdateEcoleInput,
} from '../../api/configuration';

const ONGLETS_REGIMES: { value: GrilleRegime; label: string }[] = [
  { value: 'TOUS', label: 'Tous régimes' },
  ...REGIMES,
];

const LIBELLES_TRANCHES = ['Tranche 1', 'Tranche 2', 'Tranche 3'];

const formatGnf = (n: number) => `${n.toLocaleString('fr-FR')} GNF`;

function erreur(e: any, defaut: string) {
  notifications.show({ message: e?.response?.data?.message ?? defaut, color: 'red' });
}

export function ConfigurationPage() {
  const { user } = useAuth();
  const estDirection = user?.role === 'FONDATEUR' || user?.role === 'CHEF_ETABLISSEMENT';

  return (
    <Stack>
      <Title order={2}>Configuration de l'école</Title>
      <CoordonneesEcole modifiable={estDirection} />
      {user?.role === 'FONDATEUR' && <SynchronisationConfiguration />}
      <GrilleTarifaire peutChargerModele={estDirection} />
      <AssuranceConfiguration modifiable={estDirection || user?.role === 'COMPTABLE'} />
      <FormationsSupplementaires modifiable={estDirection || user?.role === 'COMPTABLE'} />
    </Stack>
  );
}

function CoordonneesEcole({ modifiable }: { modifiable: boolean }) {
  const queryClient = useQueryClient();
  const { data: ecole } = useQuery({ queryKey: ['configuration-ecole'], queryFn: fetchEcoleConfiguration });
  const [form, setForm] = useState<UpdateEcoleInput>({});
  const [importOuvert, setImportOuvert] = useState(false);
  const logoEcole = useLogoEcole();
  const logoMutation = useMutation({
    mutationFn: (fichier: File | null) => (fichier ? envoyerLogo(fichier) : retirerLogo()),
    onSuccess: (_d, fichier) => {
      // nouvelle version du logo : en-tête, connexion et documents PDF l'utilisent aussitôt
      queryClient.invalidateQueries({ queryKey: ['ecole-publique'] });
      notifications.show({ message: fichier ? 'Logo mis à jour' : 'Logo par défaut rétabli', color: 'green' });
    },
    onError: (e) => erreur(e, "Erreur lors de l'envoi du logo (PNG ou JPEG, 2 Mo maximum)"),
  });

  useEffect(() => {
    if (ecole) setForm(ecole);
  }, [ecole]);

  const mutation = useMutation({
    mutationFn: () => updateEcoleConfiguration(form),
    onSuccess: (data) => {
      queryClient.setQueryData(['configuration-ecole'], data);
      queryClient.invalidateQueries({ queryKey: ['ecole-publique'] }); // nom de l'école sur la page de connexion
      notifications.show({ message: "Coordonnées de l'école enregistrées", color: 'green' });
    },
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement"),
  });

  const champ = (cle: Exclude<keyof UpdateEcoleInput, 'numeroRecuDepart'>, label: string, placeholder?: string) => (
    <TextInput
      label={label}
      placeholder={placeholder}
      value={form[cle] ?? ''}
      readOnly={!modifiable}
      onChange={(e) => {
        const valeur = e.currentTarget.value;
        setForm((f) => ({ ...f, [cle]: valeur }));
      }}
    />
  );

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Coordonnées</Title>
        <Group gap="xs">
          <Button variant="default" leftSection={<IconDownload size={16} stroke={1.5} />} onClick={() => telechargerCoordonnees()}>
            Exporter (Excel)
          </Button>
          {modifiable && (
            <Button variant="default" leftSection={<IconUpload size={16} stroke={1.5} />} onClick={() => setImportOuvert(true)}>
              Importer (Excel)
            </Button>
          )}
        </Group>
      </Group>
      <ImportCoordonneesModal
        opened={importOuvert}
        onClose={() => setImportOuvert(false)}
        onImporte={(data) => {
          queryClient.setQueryData(['configuration-ecole'], data);
          queryClient.invalidateQueries({ queryKey: ['ecole-publique'] });
        }}
      />
      <Group align="center" mb="md" gap="md">
        <img
          src={logoEcole}
          alt="Logo de l'école"
          onError={(e) => (e.currentTarget.src = logoParDefaut)}
          style={{ height: 64, maxWidth: 360, objectFit: 'contain', border: '1px solid var(--mantine-color-gray-3)', borderRadius: 4, padding: 4 }}
        />
        {modifiable && (
          <Stack gap={4}>
            <FileButton onChange={(f) => f && logoMutation.mutate(f)} accept="image/png,image/jpeg">
              {(props) => (
                <Button {...props} size="xs" variant="light" leftSection={<IconUpload size={14} stroke={1.5} />} loading={logoMutation.isPending}>
                  Changer le logo
                </Button>
              )}
            </FileButton>
            <Button size="xs" variant="subtle" color="gray" onClick={() => logoMutation.mutate(null)}>
              Logo par défaut
            </Button>
            <Text size="xs" c="dimmed">
              PNG ou JPEG, 2 Mo maximum : utilisé dans l'application, les reçus et les documents.
            </Text>
          </Stack>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {champ('nom', "Nom de l'école")}
        {champ('sigle', 'Sigle')}
        {champ('telephone', 'Téléphone')}
        {champ('email', 'Email')}
        {champ('ville', 'Ville')}
      </SimpleGrid>
      <Title order={5} mt="md" mb="xs">
        Bordereau journalier et reçus
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 3 }}>
        {champ('nomDirecteur', 'Directeur Général')}
        {champ('nomComptable', 'Percepteur-Comptable')}
        <NumberInput
          label="Numéroter les reçus à partir de"
          description="Pour continuer le carnet papier"
          min={1}
          allowDecimal={false}
          allowNegative={false}
          readOnly={!modifiable}
          value={form.numeroRecuDepart ?? ''}
          onChange={(v) => setForm((f) => ({ ...f, numeroRecuDepart: typeof v === 'number' ? v : null }))}
        />
      </SimpleGrid>
      <Title order={5} mt="md" mb="xs">
        Cartes de retrait (maternelle)
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 4 }}>
        {champ('carteRetraitMinistere', 'Ministère', 'MEN-A')}
        {champ('carteRetraitDev', 'DEV', 'Conakry')}
        {champ('carteRetraitDce', 'DCE', 'Matoto')}
        {champ('carteRetraitSignataire', 'Signataire', 'La Coordinatrice')}
      </SimpleGrid>
      {modifiable && (
        <Group mt="md">
          <Button disabled={!form.nom?.trim()} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Enregistrer les coordonnées
          </Button>
        </Group>
      )}
    </Paper>
  );
}

function GrilleTarifaire({ peutChargerModele }: { peutChargerModele: boolean }) {
  const queryClient = useQueryClient();
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const anneeCourante = annees?.find((a) => a.courante) ?? annees?.[0];
  const [anneeChoisie, setAnneeChoisie] = useState<string | null>(null);
  const anneeScolaireId = anneeChoisie ?? anneeCourante?.id ?? null;
  const libelleAnneeGrille = annees?.find((a) => a.id === anneeScolaireId)?.libelle ?? '';
  const [importOuvert, setImportOuvert] = useState(false);

  const { data: grilleServeur, isLoading } = useQuery({
    queryKey: ['configuration-grille', anneeScolaireId],
    queryFn: () => fetchGrille(anneeScolaireId!),
    enabled: !!anneeScolaireId,
  });

  // Copie locale éditée : rien n'est envoyé avant « Enregistrer la grille ».
  const [grille, setGrille] = useState<Grille | null>(null);
  const [modifiee, setModifiee] = useState(false);
  useEffect(() => {
    setGrille(grilleServeur ?? null);
    setModifiee(false);
  }, [grilleServeur]);

  function apresEnregistrement(data: Grille, message: string) {
    queryClient.setQueryData(['configuration-grille', data.anneeScolaireId], data);
    for (const cle of ['tarifs', 'frais-inscription-niveau', 'niveaux', 'classes', 'annees-scolaires', 'configuration-ecole']) {
      queryClient.invalidateQueries({ queryKey: [cle] });
    }
    setAnneeChoisie(data.anneeScolaireId);
    notifications.show({ message, color: 'green' });
  }

  const enregistrerMutation = useMutation({
    mutationFn: () => enregistrerGrille(grille!),
    onSuccess: (data) => apresEnregistrement(data, 'Grille tarifaire enregistrée'),
    onError: (e) => erreur(e, "Erreur lors de l'enregistrement de la grille"),
  });

  const modeleMutation = useMutation({
    mutationFn: chargerModeleMameTa,
    onSuccess: (data) => apresEnregistrement(data, 'Fiche Mamé-TA 2025-2026 chargée'),
    onError: (e) => erreur(e, 'Erreur lors du chargement de la fiche'),
  });

  function confirmerModele() {
    modals.openConfirmModal({
      title: 'Charger la fiche Mamé-TA 2025-2026',
      centered: true,
      children: (
        <Text size="sm">
          Remplit les coordonnées de l'école, l'année 2025-2026, les niveaux (crèche/garderie, PS à GS, 1ère à
          6ème année, une classe par niveau), les frais d'inscription et toute la grille tarifaire de la fiche.
          Les tranches de 2025-2026 saisies ici seront remplacées par celles de la fiche. Les factures déjà
          émises ne changent pas.
        </Text>
      ),
      labels: { confirm: 'Charger la fiche', cancel: 'Annuler' },
      onConfirm: () => modeleMutation.mutate(),
    });
  }

  function modifierNiveau(niveauId: string, maj: (n: GrilleNiveau) => GrilleNiveau) {
    setGrille((g) => g && { ...g, niveaux: g.niveaux.map((n) => (n.niveauId === niveauId ? maj(n) : n)) });
    setModifiee(true);
  }

  function modifierTranche(niveauId: string, regime: GrilleRegime, index: number, montant: number | null) {
    modifierNiveau(niveauId, (n) => {
      const tranches: Tranches = [...(n.tarifs[regime] ?? [null, null, null])];
      tranches[index] = montant;
      return { ...n, tarifs: { ...n.tarifs, [regime]: tranches } };
    });
  }

  function modifierEcheance(index: number, valeur: string) {
    setGrille((g) => g && { ...g, echeances: g.echeances.map((e, i) => (i === index ? valeur || null : e)) });
    setModifiee(true);
  }

  const versMontant = (v: string | number) => (v === '' ? null : Number(v));

  return (
    <Paper withBorder p="md">
      <Group justify="space-between" mb="sm">
        <Title order={4}>Grille tarifaire</Title>
        <Group gap="xs">
          {anneeScolaireId && (
            <>
              <Button
                variant="default"
                leftSection={<IconDownload size={16} stroke={1.5} />}
                onClick={() => telechargerGrille(anneeScolaireId, `grille-tarifaire-${libelleAnneeGrille}.xlsx`)}
              >
                Exporter (Excel)
              </Button>
              <Button
                variant="default"
                leftSection={<IconUpload size={16} stroke={1.5} />}
                disabled={modifiee}
                title={modifiee ? "Enregistrez d'abord vos modifications" : undefined}
                onClick={() => setImportOuvert(true)}
              >
                Importer (Excel)
              </Button>
            </>
          )}
          {peutChargerModele && (
            <Button variant="light" loading={modeleMutation.isPending} onClick={confirmerModele}>
              Charger la fiche Mamé-TA 2025-2026
            </Button>
          )}
        </Group>
      </Group>

      {anneeScolaireId && (
        <ImportGrilleModal
          opened={importOuvert}
          onClose={() => setImportOuvert(false)}
          anneeScolaireId={anneeScolaireId}
          libelleAnnee={libelleAnneeGrille}
          onImportee={(data) => apresEnregistrement(data, 'Grille tarifaire importée')}
        />
      )}
      <Alert variant="light" icon={<IconInfoCircle />} mb="md">
        Chaque tranche renseignée est facturée aux élèves du niveau inscrits sous ce régime ; l'onglet « Tous
        régimes » s'applique à tous les élèves du niveau, quel que soit leur régime. Une case vide supprime la
        tranche. Les factures déjà émises ne changent pas : après modification, utilisez « Régénérer les factures
        manquantes » dans le Bilan financier pour facturer les élèves déjà inscrits.
      </Alert>

      <Group align="flex-end" mb="md">
        <Select
          label="Année scolaire"
          data={(annees ?? []).map((a) => ({ value: a.id, label: libelleAnnee(a) }))}
          value={anneeScolaireId}
          onChange={setAnneeChoisie}
          allowDeselect={false}
          w={{ base: '100%', sm: 200 }}
        />
        {grille &&
          LIBELLES_TRANCHES.map((libelle, i) => (
            <TextInput
              key={libelle}
              type="date"
              label={`Échéance ${libelle.toLowerCase()}`}
              value={grille.echeances[i] ?? ''}
              onChange={(e) => modifierEcheance(i, e.currentTarget.value)}
            />
          ))}
      </Group>

      {!anneeScolaireId && (
        <Text c="dimmed">
          Aucune année scolaire : créez-en une {peutChargerModele ? 'ou chargez la fiche Mamé-TA ' : ''}pour saisir la
          grille.
        </Text>
      )}
      {isLoading && <p>Chargement...</p>}
      {grille && grille.niveaux.length === 0 && <Text c="dimmed">Aucun niveau défini pour l'instant.</Text>}

      {grille && grille.niveaux.length > 0 && (
        <Tabs defaultValue="EXTERNAT" keepMounted={false}>
          <Tabs.List>
            {ONGLETS_REGIMES.map((r) => (
              <Tabs.Tab key={r.value} value={r.value}>
                {r.label}
              </Tabs.Tab>
            ))}
            <Tabs.Tab value="INSCRIPTION">Inscription</Tabs.Tab>
          </Tabs.List>

          {ONGLETS_REGIMES.map((r) => (
            <Tabs.Panel key={r.value} value={r.value} pt="sm">
              <Table.ScrollContainer minWidth={720}>
                <Table striped>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Niveau</Table.Th>
                      {LIBELLES_TRANCHES.map((l) => (
                        <Table.Th key={l}>{l}</Table.Th>
                      ))}
                      <Table.Th>Total</Table.Th>
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {grille.niveaux.map((n) => {
                      const tranches = n.tarifs[r.value] ?? [null, null, null];
                      const total = tranches.reduce<number>((acc, m) => acc + (m ?? 0), 0);
                      return (
                        <Table.Tr key={n.niveauId}>
                          <Table.Td>{n.nom}</Table.Td>
                          {tranches.map((montant, i) => (
                            <Table.Td key={i}>
                              <NumberInput
                                aria-label={`${n.nom} ${r.label} ${LIBELLES_TRANCHES[i]}`}
                                value={montant ?? ''}
                                onChange={(v) => modifierTranche(n.niveauId, r.value, i, versMontant(v))}
                                min={0}
                                step={50_000}
                                thousandSeparator=" "
                                hideControls
                              />
                            </Table.Td>
                          ))}
                          <Table.Td style={{ whiteSpace: 'nowrap' }}>{total > 0 ? formatGnf(total) : '—'}</Table.Td>
                        </Table.Tr>
                      );
                    })}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </Tabs.Panel>
          ))}

          <Tabs.Panel value="INSCRIPTION" pt="sm">
            <Text size="sm" c="dimmed" mb="xs">
              Facturés à l'admission. Réinscription vide : le montant « nouveaux » s'applique aussi aux élèves qui
              reviennent.
            </Text>
            <Table.ScrollContainer minWidth={520}>
              <Table striped>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Niveau</Table.Th>
                    <Table.Th>Inscription (nouveaux)</Table.Th>
                    <Table.Th>Réinscription</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {grille.niveaux.map((n) => (
                    <Table.Tr key={n.niveauId}>
                      <Table.Td>{n.nom}</Table.Td>
                      <Table.Td>
                        <NumberInput
                          aria-label={`${n.nom} inscription`}
                          value={n.fraisInscription ?? ''}
                          onChange={(v) => modifierNiveau(n.niveauId, (x) => ({ ...x, fraisInscription: versMontant(v) }))}
                          min={0}
                          thousandSeparator=" "
                          hideControls
                        />
                      </Table.Td>
                      <Table.Td>
                        <NumberInput
                          aria-label={`${n.nom} réinscription`}
                          value={n.fraisReinscription ?? ''}
                          onChange={(v) => modifierNiveau(n.niveauId, (x) => ({ ...x, fraisReinscription: versMontant(v) }))}
                          min={0}
                          thousandSeparator=" "
                          hideControls
                        />
                      </Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          </Tabs.Panel>
        </Tabs>
      )}

      {grille && grille.niveaux.length > 0 && (
        <Group mt="md">
          <Button disabled={!modifiee} loading={enregistrerMutation.isPending} onClick={() => enregistrerMutation.mutate()}>
            Enregistrer la grille
          </Button>
          {modifiee && (
            <Text size="sm" c="orange">
              Modifications non enregistrées
            </Text>
          )}
        </Group>
      )}
    </Paper>
  );
}
