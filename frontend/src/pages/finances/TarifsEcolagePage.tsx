import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Table, Title, Group, Paper, TextInput, Select, NumberInput, Button, Stack, Text, Modal, Anchor } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  fetchTarifs,
  createTarif,
  updateTarif,
  fetchFraisInscriptionNiveau,
  createFraisInscriptionNiveau,
  updateFraisInscriptionNiveau,
  type TarifEcolage,
  type FraisInscriptionNiveau,
} from '../../api/finances';
import { fetchNiveaux, fetchAnneesScolaires } from '../../api/classes';

export function TarifsEcolagePage() {
  const queryClient = useQueryClient();
  const { data: tarifs, isLoading } = useQuery({ queryKey: ['tarifs'], queryFn: fetchTarifs });
  const { data: niveaux } = useQuery({ queryKey: ['niveaux'], queryFn: fetchNiveaux });
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const { data: fraisInscription, isLoading: fraisInscriptionChargement } = useQuery({
    queryKey: ['frais-inscription-niveau'],
    queryFn: fetchFraisInscriptionNiveau,
  });

  const [libelle, setLibelle] = useState('');
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [montant, setMontant] = useState<number | ''>('');

  const anneeCourante = annees?.find((a) => a.courante) ?? annees?.[0];
  const [anneeScolaireId, setAnneeScolaireId] = useState<string | null>(null);
  const anneeSelectionnee = anneeScolaireId ?? anneeCourante?.id ?? null;

  const mutation = useMutation({
    mutationFn: () =>
      createTarif({
        niveauId: niveauId!,
        anneeScolaireId: anneeSelectionnee!,
        libelle,
        montant: Number(montant),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifs'] });
      notifications.show({ message: 'Tarif créé', color: 'green' });
      setLibelle('');
      setNiveauId(null);
      setMontant('');
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la création du tarif', color: 'red' }),
  });

  // Édition d'un tarif d'écolage existant
  const [tarifEnEdition, setTarifEnEdition] = useState<TarifEcolage | null>(null);
  const [libelleEdition, setLibelleEdition] = useState('');
  const [montantEdition, setMontantEdition] = useState<number | ''>('');
  const [anneeEditionTarif, setAnneeEditionTarif] = useState<string | null>(null);

  function ouvrirEditionTarif(t: TarifEcolage) {
    setTarifEnEdition(t);
    setLibelleEdition(t.libelle);
    setMontantEdition(Number(t.montant));
    setAnneeEditionTarif(t.anneeScolaireId);
  }

  const editionTarifMutation = useMutation({
    mutationFn: () =>
      updateTarif(tarifEnEdition!.id, {
        libelle: libelleEdition,
        montant: Number(montantEdition),
        anneeScolaireId: anneeEditionTarif ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tarifs'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      notifications.show({ message: 'Tarif modifié', color: 'green' });
      setTarifEnEdition(null);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  const [niveauIdInscription, setNiveauIdInscription] = useState<string | null>(null);
  const [montantInscription, setMontantInscription] = useState<number | ''>('');
  const [anneeScolaireIdInscription, setAnneeScolaireIdInscription] = useState<string | null>(null);
  const anneeSelectionneeInscription = anneeScolaireIdInscription ?? anneeCourante?.id ?? null;

  const fraisInscriptionMutation = useMutation({
    mutationFn: () =>
      createFraisInscriptionNiveau({
        niveauId: niveauIdInscription!,
        anneeScolaireId: anneeSelectionneeInscription!,
        montant: Number(montantInscription),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frais-inscription-niveau'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      notifications.show({ message: "Frais d'inscription du niveau enregistrés", color: 'green' });
      setNiveauIdInscription(null);
      setMontantInscription('');
    },
    onError: (error: any) =>
      notifications.show({
        message: error?.response?.data?.message ?? "Erreur lors de l'enregistrement",
        color: 'red',
      }),
  });

  // Édition d'un frais d'inscription niveau existant
  const [fraisEnEdition, setFraisEnEdition] = useState<FraisInscriptionNiveau | null>(null);
  const [montantFraisEdition, setMontantFraisEdition] = useState<number | ''>('');
  const [anneeEditionFrais, setAnneeEditionFrais] = useState<string | null>(null);

  function ouvrirEditionFrais(f: FraisInscriptionNiveau) {
    setFraisEnEdition(f);
    setMontantFraisEdition(Number(f.montant));
    setAnneeEditionFrais(f.anneeScolaireId);
  }

  const editionFraisMutation = useMutation({
    mutationFn: () =>
      updateFraisInscriptionNiveau(fraisEnEdition!.id, {
        montant: Number(montantFraisEdition),
        anneeScolaireId: anneeEditionFrais ?? undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['frais-inscription-niveau'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      notifications.show({ message: "Montant modifié", color: 'green' });
      setFraisEnEdition(null);
    },
    onError: (error: any) =>
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  return (
    <Stack>
      <Title order={2}>Tarifs d'écolage</Title>
      <Text size="sm" c="dimmed">
        Chaque tarif défini ici est facturé automatiquement à tout élève inscrit dans une classe de ce
        niveau, pour l'année scolaire concernée. Plusieurs tarifs sur un même niveau (ex: par trimestre)
        génèrent chacun leur propre facture.
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Nouveau tarif
        </Title>
        <Group>
          <TextInput placeholder="Libellé (ex: Écolage annuel)" value={libelle} onChange={(e) => setLibelle(e.currentTarget.value)} />
          <Select
            placeholder="Niveau"
            data={(niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
            value={niveauId}
            onChange={setNiveauId}
          />
          <Select
            placeholder="Année scolaire"
            data={(annees ?? []).map((a) => ({ value: a.id, label: a.libelle + (a.courante ? ' (courante)' : '') }))}
            value={anneeSelectionnee}
            onChange={setAnneeScolaireId}
            w={180}
          />
          <NumberInput placeholder="Montant (GNF)" value={montant} onChange={(v) => setMontant(v === '' ? '' : Number(v))} />
          <Button
            disabled={!libelle || !niveauId || !montant || !anneeSelectionnee}
            loading={mutation.isPending}
            onClick={() => mutation.mutate()}
          >
            Créer
          </Button>
        </Group>
      </Paper>

      {isLoading && <p>Chargement...</p>}

      {tarifs && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Niveau</Table.Th>
              <Table.Th>Année scolaire</Table.Th>
              <Table.Th>Libellé</Table.Th>
              <Table.Th>Montant</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tarifs.map((t) => (
              <Table.Tr key={t.id}>
                <Table.Td>{t.niveau.nom}</Table.Td>
                <Table.Td>{t.anneeScolaire?.libelle ?? '—'}</Table.Td>
                <Table.Td>{t.libelle}</Table.Td>
                <Table.Td>{Number(t.montant).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>
                  <Anchor component="button" type="button" size="sm" onClick={() => ouvrirEditionTarif(t)}>
                    Modifier
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Title order={2} mt="lg">
        Frais d'inscription par niveau
      </Title>
      <Text size="sm" c="dimmed">
        Montant facturé à l'inscription de tout élève admis dans une classe de ce niveau, pour l'année
        scolaire concernée. Un seul montant par niveau et par année scolaire.
      </Text>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Nouveau montant
        </Title>
        <Group>
          <Select
            placeholder="Niveau"
            data={(niveaux ?? []).map((n) => ({ value: n.id, label: n.nom }))}
            value={niveauIdInscription}
            onChange={setNiveauIdInscription}
          />
          <Select
            placeholder="Année scolaire"
            data={(annees ?? []).map((a) => ({ value: a.id, label: a.libelle + (a.courante ? ' (courante)' : '') }))}
            value={anneeSelectionneeInscription}
            onChange={setAnneeScolaireIdInscription}
            w={180}
          />
          <NumberInput
            placeholder="Montant (GNF)"
            value={montantInscription}
            onChange={(v) => setMontantInscription(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!niveauIdInscription || !montantInscription || !anneeSelectionneeInscription}
            loading={fraisInscriptionMutation.isPending}
            onClick={() => fraisInscriptionMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Group>
      </Paper>

      {fraisInscriptionChargement && <p>Chargement...</p>}

      {fraisInscription && fraisInscription.length === 0 && (
        <Text c="dimmed">Aucun montant par défaut défini pour l'instant.</Text>
      )}

      {fraisInscription && fraisInscription.length > 0 && (
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Niveau</Table.Th>
              <Table.Th>Année scolaire</Table.Th>
              <Table.Th>Montant</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {fraisInscription.map((f) => (
              <Table.Tr key={f.id}>
                <Table.Td>{f.niveau.nom}</Table.Td>
                <Table.Td>{f.anneeScolaire?.libelle ?? '—'}</Table.Td>
                <Table.Td>{Number(f.montant).toLocaleString('fr-FR')} GNF</Table.Td>
                <Table.Td>
                  <Anchor component="button" type="button" size="sm" onClick={() => ouvrirEditionFrais(f)}>
                    Modifier
                  </Anchor>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      )}

      <Modal opened={!!tarifEnEdition} onClose={() => setTarifEnEdition(null)} title="Modifier le tarif">
        <Stack>
          {tarifEnEdition && (
            <Text size="sm" c="dimmed">
              Niveau : {tarifEnEdition.niveau.nom}
            </Text>
          )}
          <TextInput label="Libellé" value={libelleEdition} onChange={(e) => setLibelleEdition(e.currentTarget.value)} />
          <Select
            label="Année scolaire"
            data={(annees ?? []).map((a) => ({ value: a.id, label: a.libelle + (a.courante ? ' (courante)' : '') }))}
            value={anneeEditionTarif}
            onChange={setAnneeEditionTarif}
          />
          <NumberInput
            label="Montant (GNF)"
            min={0}
            value={montantEdition}
            onChange={(v) => setMontantEdition(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!libelleEdition || !montantEdition || !anneeEditionTarif}
            loading={editionTarifMutation.isPending}
            onClick={() => editionTarifMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Stack>
      </Modal>

      <Modal opened={!!fraisEnEdition} onClose={() => setFraisEnEdition(null)} title="Modifier le montant">
        <Stack>
          {fraisEnEdition && (
            <Text size="sm" c="dimmed">
              Niveau : {fraisEnEdition.niveau.nom}
            </Text>
          )}
          <Select
            label="Année scolaire"
            data={(annees ?? []).map((a) => ({ value: a.id, label: a.libelle + (a.courante ? ' (courante)' : '') }))}
            value={anneeEditionFrais}
            onChange={setAnneeEditionFrais}
          />
          <NumberInput
            label="Montant (GNF)"
            min={0}
            value={montantFraisEdition}
            onChange={(v) => setMontantFraisEdition(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!montantFraisEdition || !anneeEditionFrais}
            loading={editionFraisMutation.isPending}
            onClick={() => editionFraisMutation.mutate()}
          >
            Enregistrer
          </Button>
        </Stack>
      </Modal>
    </Stack>
  );
}
