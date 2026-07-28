import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Title, Text, Paper, Group, Stack, Select, Button, Badge, SimpleGrid, TextInput, NumberInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload, IconEye } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchEleveFiche, inscrireEleve } from '../../api/eleves';
import { fetchClasses } from '../../api/classes';
import { createFacture, ouvrirFacturePdf, ouvrirRecu } from '../../api/finances';
import { telechargerBulletin, ouvrirBulletinPdf } from '../../api/notes';

export function EleveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [selectedClasse, setSelectedClasse] = useState<string | null>(null);
  const [factureLibelle, setFactureLibelle] = useState('');
  const [factureMontant, setFactureMontant] = useState<number | ''>('');
  const [trimestreBulletin, setTrimestreBulletin] = useState<string | null>('1');

  const { data: fiche, isLoading } = useQuery({
    queryKey: ['eleve-fiche', id],
    queryFn: () => fetchEleveFiche(id!),
    enabled: !!id,
  });

  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });

  const mutation = useMutation({
    mutationFn: (classeId: string) => inscrireEleve(id!, classeId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', id] });
      queryClient.invalidateQueries({ queryKey: ['classes'] });
      notifications.show({ message: 'Élève affecté à la classe', color: 'green' });
    },
  });

  const factureMutation = useMutation({
    mutationFn: () => createFacture({ eleveId: id!, libelle: factureLibelle, montantTotal: Number(factureMontant) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eleve-fiche', id] });
      queryClient.invalidateQueries({ queryKey: ['factures-impayes'] });
      notifications.show({ message: 'Facture créée', color: 'green' });
      setFactureLibelle('');
      setFactureMontant('');
    },
    onError: () => notifications.show({ message: 'Erreur lors de la création de la facture', color: 'red' }),
  });

  if (isLoading || !fiche) return <p>Chargement...</p>;

  const inscriptionActuelle = fiche.inscriptions?.[0];
  const demandeOrigine = fiche.demandesInscription?.[0];

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>
          {fiche.prenom} {fiche.nom}
        </Title>
        {demandeOrigine && (
          <Badge variant="light" color="grape">
            Admis le {new Date(demandeOrigine.createdAt).toLocaleDateString('fr-FR')}
          </Badge>
        )}
      </Group>

      <SimpleGrid cols={3}>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Classe actuelle
          </Text>
          <Text fw={700}>{inscriptionActuelle ? inscriptionActuelle.classe.nom : 'Non affecté'}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Absences / retards (année en cours)
          </Text>
          <Text fw={700}>{fiche.absencesCount}</Text>
        </Paper>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Solde
          </Text>
          <Text fw={700} c={fiche.solde > 0 ? 'red' : 'green'}>
            {fiche.solde.toLocaleString('fr-FR')} GNF
          </Text>
        </Paper>
      </SimpleGrid>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Affecter à une classe
        </Title>
        <Group>
          <Select
            placeholder="Choisir une classe"
            data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
            value={selectedClasse}
            onChange={setSelectedClasse}
            w={280}
          />
          <Button disabled={!selectedClasse} loading={mutation.isPending} onClick={() => selectedClasse && mutation.mutate(selectedClasse)}>
            Affecter
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Créer une facture
        </Title>
        <Group>
          <TextInput
            placeholder="Libellé (ex: Écolage Trimestre 1)"
            value={factureLibelle}
            onChange={(e) => setFactureLibelle(e.currentTarget.value)}
            w={280}
          />
          <NumberInput
            placeholder="Montant (GNF)"
            value={factureMontant}
            onChange={(v) => setFactureMontant(v === '' ? '' : Number(v))}
          />
          <Button
            disabled={!factureLibelle || !factureMontant}
            loading={factureMutation.isPending}
            onClick={() => factureMutation.mutate()}
          >
            Créer la facture
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Factures
        </Title>
        {fiche.factures.length === 0 && <Text c="dimmed">Aucune facture</Text>}
        {fiche.factures.map((f: any) => (
          <Stack key={f.id} mb="sm" gap={4}>
            <Group justify="space-between">
              <Text>
                {f.libelle} — {Number(f.montantTotal).toLocaleString('fr-FR')} GNF ({f.statut})
              </Text>
              <Button size="xs" variant="light" leftSection={<IconEye size={14} stroke={1.5} />} onClick={() => ouvrirFacturePdf(f.id)}>
                Voir la facture
              </Button>
            </Group>
            {f.paiements.length === 0 && (
              <Text size="sm" c="dimmed" ml="md">
                Aucun paiement enregistré
              </Text>
            )}
            {f.paiements.map((p: any) => (
              <Group key={p.id} justify="space-between" ml="md">
                <Text size="sm" c="dimmed">
                  {new Date(p.datePaiement).toLocaleDateString('fr-FR')} — {Number(p.montant).toLocaleString('fr-FR')} GNF ({p.mode})
                </Text>
                <Button size="xs" variant="subtle" leftSection={<IconEye size={14} stroke={1.5} />} onClick={() => ouvrirRecu(p.id)}>
                  Voir le reçu
                </Button>
              </Group>
            ))}
          </Stack>
        ))}
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Bulletin de notes
        </Title>
        <Group>
          <Select
            data={[
              { value: '1', label: 'Trimestre 1' },
              { value: '2', label: 'Trimestre 2' },
              { value: '3', label: 'Trimestre 3' },
            ]}
            value={trimestreBulletin}
            onChange={setTrimestreBulletin}
            w={160}
          />
          <Button
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() => telechargerBulletin(id!, Number(trimestreBulletin))}
          >
            Télécharger le bulletin
          </Button>
          <Button
            variant="light"
            leftSection={<IconEye size={16} stroke={1.5} />}
            onClick={() => ouvrirBulletinPdf(id!, Number(trimestreBulletin))}
          >
            Voir le bulletin
          </Button>
        </Group>
      </Paper>

      <Paper withBorder p="md">
        <Title order={4} mb="sm">
          Parents / tuteurs
        </Title>
        {fiche.parentsLiens.length === 0 && <Text c="dimmed">Aucun parent lié</Text>}
        {fiche.parentsLiens.map((lien: any) => (
          <Badge key={lien.id} mr="xs">
            {lien.parentTuteur.prenom} {lien.parentTuteur.nom} ({lien.lien})
          </Badge>
        ))}
      </Paper>
    </Stack>
  );
}
