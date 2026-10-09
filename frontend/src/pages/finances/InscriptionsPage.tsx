import { useState } from 'react';
import { Link } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Anchor, Badge, Button, Group, Paper, Select, SimpleGrid, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { IconCash, IconSearch } from '@tabler/icons-react';
import { fetchInscriptionsAPayer, type EtatFiltreInscription, type EtatInscription } from '../../api/payerInscription';
import { PayerInscriptionModal, type InscriptionAPayer } from '../eleves/PayerInscriptionModal';

function fmt(n: number) {
  return n.toLocaleString('fr-FR');
}

const ETATS: { value: EtatFiltreInscription; label: string }[] = [
  { value: 'A_PAYER', label: 'À payer' },
  { value: 'PAYEE', label: 'Payées' },
  { value: 'FRAIS_NON_DEFINIS', label: 'Frais non définis' },
  { value: 'TOUS', label: 'Toutes' },
];

const BADGE_ETAT: Record<EtatInscription, { label: string; color: string }> = {
  A_PAYER: { label: 'À payer', color: 'red' },
  PAYEE: { label: 'Payée', color: 'green' },
  FRAIS_NON_DEFINIS: { label: 'Frais non définis', color: 'gray' },
};

function Chiffre({ label, valeur, color }: { label: string; valeur: string; color?: string }) {
  return (
    <Paper withBorder p="md">
      <Text size="sm" c="dimmed">
        {label}
      </Text>
      <Text fw={700} size="xl" c={color}>
        {valeur}
      </Text>
    </Paper>
  );
}

// Paiement de l'inscription et de la réinscription : l'admission ne les encaisse plus. Cette page liste les
// élèves inscrits cette année, ce qu'ils doivent (frais d'inscription ou de réinscription de leur niveau) et
// permet d'encaisser, avec reçu : en cliquant sur « Payer », on choisit le type d'opération (inscription ou réinscription).
export function InscriptionsPage() {
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [etat, setEtat] = useState<EtatFiltreInscription>('A_PAYER');
  const [recherche, setRecherche] = useState('');
  const [selection, setSelection] = useState<InscriptionAPayer | null>(null);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['inscriptions-a-payer', niveauId, classeId, etat],
    queryFn: () => fetchInscriptionsAPayer({ niveauId: niveauId ?? undefined, classeId: classeId ?? undefined, etat }),
    placeholderData: keepPreviousData, // pas de clignotement quand on change de filtre
  });

  const classes = (data?.filtres.classes ?? []).filter((c) => !niveauId || c.niveauId === niveauId);
  const terme = recherche.trim().toLowerCase();
  const lignes = (data?.lignes ?? []).filter(
    (l) => !terme || l.nomComplet.toLowerCase().includes(terme) || (l.matricule ?? '').toLowerCase().includes(terme),
  );

  return (
    <Stack>
      <div>
        <Title order={2}>Paiement inscription/réinscription</Title>
        <Text c="dimmed" size="sm">
          Année scolaire {data?.anneeScolaire.libelle ?? ''} : frais d'inscription ou de réinscription du niveau de chaque élève
        </Text>
      </div>

      <Group gap="sm" align="flex-end">
        <Select
          label="Niveau"
          placeholder="Tous les niveaux"
          data={(data?.filtres.niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
          value={niveauId}
          onChange={(v) => {
            setNiveauId(v);
            // une classe d'un autre niveau n'a plus de sens
            if (classeId && v && !data?.filtres.classes.some((c) => c.id === classeId && c.niveauId === v)) setClasseId(null);
          }}
          clearable
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="Classe"
          placeholder="Toutes les classes"
          data={classes.map((c) => ({ value: c.id, label: c.nom }))}
          value={classeId}
          onChange={setClasseId}
          clearable
          w={{ base: '100%', sm: 200 }}
        />
        <Select
          label="État"
          data={ETATS}
          value={etat}
          onChange={(v) => setEtat((v as EtatFiltreInscription) ?? 'A_PAYER')}
          allowDeselect={false}
          w={{ base: '100%', sm: 200 }}
        />
        <TextInput
          label="Recherche"
          placeholder="Nom ou matricule"
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
          w={{ base: '100%', sm: 220 }}
        />
      </Group>

      {isLoading && <Text c="dimmed">Chargement...</Text>}
      {isError && (
        <Text c="red">Impossible de charger la liste : {(error as any)?.response?.data?.message ?? 'le serveur ne répond pas'}.</Text>
      )}

      {data && (
        <>
          <SimpleGrid cols={{ base: 2, md: 4 }}>
            <Chiffre label="À payer" valeur={`${data.resume.aPayer} élève${data.resume.aPayer > 1 ? 's' : ''}`} color={data.resume.aPayer > 0 ? 'red' : 'green'} />
            <Chiffre label="Restant à encaisser" valeur={`${fmt(data.resume.resteTotal)} GNF`} color={data.resume.resteTotal > 0 ? 'red' : 'green'} />
            <Chiffre label="Payées" valeur={`${data.resume.payees} élève${data.resume.payees > 1 ? 's' : ''}`} color="green" />
            <Chiffre label="Déjà encaissé" valeur={`${fmt(data.resume.encaisse)} GNF`} color="green" />
          </SimpleGrid>

          {data.resume.fraisNonDefinis > 0 && (
            <Text size="sm" c="dimmed">
              {data.resume.fraisNonDefinis} élève{data.resume.fraisNonDefinis > 1 ? 's' : ''} dont le niveau n'a pas de frais d'inscription défini : renseignez-les dans la page{' '}
              <Anchor component={Link} to="/finances/tarifs" size="sm">
                Tarifs
              </Anchor>
              .
            </Text>
          )}

          <Paper withBorder p="md">
            {lignes.length === 0 ? (
              <Text c="dimmed">
                {terme ? 'Aucun élève ne correspond à cette recherche.' : etat === 'A_PAYER' ? 'Aucune inscription à payer.' : 'Aucun élève dans cet état.'}
              </Text>
            ) : (
              <Table.ScrollContainer minWidth={900}>
                <Table striped highlightOnHover verticalSpacing={6}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Matricule</Table.Th>
                      <Table.Th>Prénoms & Nom</Table.Th>
                      <Table.Th>Classe</Table.Th>
                      <Table.Th>Type d'opération</Table.Th>
                      <Table.Th ta="right">Montant</Table.Th>
                      <Table.Th ta="right">Déjà payé</Table.Th>
                      <Table.Th ta="right">Reste</Table.Th>
                      <Table.Th>État</Table.Th>
                      <Table.Th />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {lignes.map((l) => (
                      <Table.Tr key={l.eleveId}>
                        <Table.Td>{l.matricule}</Table.Td>
                        <Table.Td>
                          <Anchor component={Link} to={`/eleves/${l.eleveId}`} size="sm">
                            {l.nomComplet}
                          </Anchor>
                        </Table.Td>
                        <Table.Td>
                          {l.classe} <Text span size="xs" c="dimmed">({l.niveau})</Text>
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={l.type === 'REINSCRIPTION' ? 'cyan' : 'teal'}>
                            {l.libelle}
                          </Badge>
                        </Table.Td>
                        <Table.Td ta="right">{l.etat === 'FRAIS_NON_DEFINIS' ? '' : fmt(l.montant)}</Table.Td>
                        <Table.Td ta="right">{l.dejaPaye > 0 ? fmt(l.dejaPaye) : ''}</Table.Td>
                        <Table.Td ta="right" fw={600} c={l.reste > 0 ? 'red' : undefined}>
                          {l.etat === 'FRAIS_NON_DEFINIS' ? '' : fmt(l.reste)}
                        </Table.Td>
                        <Table.Td>
                          <Badge variant="light" color={BADGE_ETAT[l.etat].color}>
                            {BADGE_ETAT[l.etat].label}
                          </Badge>
                        </Table.Td>
                        <Table.Td>
                          {l.etat === 'A_PAYER' && (
                            <Button
                              size="xs"
                              leftSection={<IconCash size={14} stroke={1.5} />}
                              onClick={() =>
                                setSelection({
                                  eleveId: l.eleveId,
                                  nomComplet: l.nomComplet,
                                  type: l.type,
                                  typeModifiable: l.typeModifiable,
                                  montants: l.montants,
                                  reste: l.reste,
                                  classe: l.classe,
                                  niveau: l.niveau,
                                  anneeLibelle: data.anneeScolaire.libelle,
                                })
                              }
                            >
                              Payer
                            </Button>
                          )}
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            )}
          </Paper>
        </>
      )}

      <PayerInscriptionModal opened={!!selection} onClose={() => setSelection(null)} inscription={selection} />
    </Stack>
  );
}
