import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Title, Text, Paper, Group, Stack, Button, Badge, SimpleGrid } from '@mantine/core';
import { IconCash, IconEye, IconReceiptOff } from '@tabler/icons-react';
import { useState } from 'react';
import { fetchEleveFiche } from '../../api/eleves';
import { ouvrirFacturePdf, ouvrirRecu, libelleRegime } from '../../api/finances';
import { Filiation } from './Filiation';
import { TranchesEcolage } from './TranchesEcolage';
import { PayerModal, lignesAPayer } from './PayerModal';
import { AnnulationPaiementModal, type OperationPaiement } from './AnnulationPaiementModal';
import { useAuth } from '../../auth/AuthContext';

const STATUTS_FACTURE: Record<string, string> = {
  IMPAYEE: 'impayée',
  PARTIELLE: 'partielle',
  PAYEE: 'payée',
  ANNULEE: 'annulée',
};

export function EleveDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  // Un enseignant reçoit une fiche restreinte (identité, classe, absences, bulletin) : ni finances, ni parents.
  const estEnseignant = user?.role === 'ENSEIGNANT';
  // Annuler un paiement : réservé au fondateur (le serveur le vérifie aussi)
  const peutAnnuler = user?.role === 'FONDATEUR';

  const { data: fiche, isLoading } = useQuery({
    queryKey: ['eleve-fiche', id],
    queryFn: () => fetchEleveFiche(id!),
    enabled: !!id,
  });

  const [paiementOuvert, setPaiementOuvert] = useState(false);
  const [aAnnuler, setAAnnuler] = useState<OperationPaiement | null>(null);

  if (isLoading || !fiche) return <p>Chargement...</p>;

  const inscriptionActuelle = fiche.inscriptions?.[0];
  const demandeOrigine = fiche.demandesInscription?.[0];

  const factures: any[] = Array.isArray(fiche.factures) ? fiche.factures : [];
  const l = lignesAPayer(factures);
  // Reste à payer sur l'écolage (tranches non annulées), à la place de l'ancien solde toutes factures confondues
  const resteEcolage = factures
    .filter((f) => f.type === 'ECOLAGE' && f.statut !== 'ANNULEE')
    .reduce((acc, f) => acc + Math.max(0, Number(f.montantTotal) - Number(f.montantPaye)), 0);
  const rienAPayer = !l.inscription.length && !l.assurance.length && !l.tranche && !l.autres.length;
  const autresFactures = factures.filter((f) => f.type !== 'ECOLAGE');
  // Une ligne par opération : les paiements enregistrés ensemble (même référence « lot:… ») n'ont qu'un reçu.
  const historique = Object.values(
    factures
      .flatMap((f) => (f.paiements ?? []).map((p: any) => ({ paiement: p, facture: f })))
      .reduce((ops: Record<string, { paiement: any; libelles: string[]; montant: number; elements: OperationPaiement['elements'] }>, { paiement: p, facture: f }) => {
        const cle = p.reference?.startsWith('lot:') ? p.reference : p.id;
        const op = (ops[cle] ??= { paiement: p, libelles: [], montant: 0, elements: [] });
        op.libelles.push(f.libelle);
        op.montant += Number(p.montant);
        op.elements.push({ id: p.id, libelle: f.libelle, montant: Number(p.montant) });
        return ops;
      }, {}),
  ).sort((a, b) => new Date(b.paiement.datePaiement).getTime() - new Date(a.paiement.datePaiement).getTime());
  // Paiements annulés, regroupés comme l'opération d'origine (même lot, annulés ensemble)
  const annules = Object.values(
    ((fiche.paiementsAnnules ?? []) as any[]).reduce((ops: Record<string, { a: any; libelles: string[]; montant: number }>, a) => {
      const cle = `${a.reference?.startsWith('lot:') ? a.reference : a.paiementId}|${a.annuleLe}`;
      const op = (ops[cle] ??= { a, libelles: [], montant: 0 });
      op.libelles.push(a.factureLibelle);
      op.montant += Number(a.montant);
      return ops;
    }, {}),
  );

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

      <SimpleGrid cols={{ base: 1, sm: 2, md: estEnseignant ? 2 : 5 }}>
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            Classe actuelle
          </Text>
          <Text fw={700}>{inscriptionActuelle ? inscriptionActuelle.classe.nom : 'Non affecté'}</Text>
          {inscriptionActuelle && (
            <Text size="sm" c="dimmed">
              {libelleRegime(inscriptionActuelle.regime)}
            </Text>
          )}
        </Paper>
        {/* Gestion : les tranches d'écolage (reste et échéance) ; l'enseignant, sans accès aux finances, garde les absences. */}
        {Array.isArray(fiche.factures) ? (
          <TranchesEcolage factures={fiche.factures} anneeScolaireId={inscriptionActuelle?.anneeScolaireId} />
        ) : (
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">
              Absences / retards (année en cours)
            </Text>
            <Text fw={700}>{fiche.absencesCount}</Text>
          </Paper>
        )}
        {Array.isArray(fiche.factures) && (
          <Paper withBorder p="md">
            <Text size="sm" c="dimmed">
              Écolage
            </Text>
            <Text fw={700} c={resteEcolage > 0 ? 'red' : 'green'}>
              {resteEcolage.toLocaleString('fr-FR')} GNF
            </Text>
            <Text size="xs" c="dimmed">
              reste à payer
            </Text>
          </Paper>
        )}
      </SimpleGrid>

      {/* Classe, carte scolaire, inscription, assurance et formations se gèrent hors de la fiche :
          Nouvel élève, Cartes scolaires et menu Finances (paiements inscription, assurance, formations). */}
      {Array.isArray(fiche.factures) && (
        <Paper withBorder p="md">
          <Group justify="space-between" mb="sm">
            <Title order={4}>Factures et paiements</Title>
            <Button
              leftSection={<IconCash size={16} stroke={1.5} />}
              disabled={rienAPayer}
              onClick={() => setPaiementOuvert(true)}
            >
              Payer
            </Button>
          </Group>

          {/* Les tranches d'écolage sont résumées en haut de la fiche ; ici, les autres factures (consultation). */}
          {autresFactures.length > 0 && (
            <Stack gap={4} mb="md">
              {autresFactures.map((f: any) => (
                <Group key={f.id} justify="space-between">
                  <Text size="sm">
                    {f.libelle} : {Number(f.montantTotal).toLocaleString('fr-FR')} GNF ({STATUTS_FACTURE[f.statut] ?? f.statut})
                  </Text>
                  <Button size="xs" variant="subtle" leftSection={<IconEye size={14} stroke={1.5} />} onClick={() => ouvrirFacturePdf(f.id)}>
                    Voir la facture
                  </Button>
                </Group>
              ))}
            </Stack>
          )}

          <Text fw={600} size="sm" mb={4}>
            Historique des paiements
          </Text>
          {historique.length === 0 && annules.length === 0 && (
            <Text size="sm" c="dimmed">
              Aucun paiement enregistré
            </Text>
          )}
          {historique.map(({ paiement: p, libelles, montant, elements }) => (
            <Group key={p.id} justify="space-between">
              <Text size="sm">
                {new Date(p.datePaiement).toLocaleDateString('fr-FR')} : {montant.toLocaleString('fr-FR')} GNF ({p.mode}){' '}
                <Text span size="sm" c="dimmed">
                  {libelles.join(' + ')}
                </Text>
              </Text>
              <Group gap={4}>
                <Button size="xs" variant="subtle" leftSection={<IconEye size={14} stroke={1.5} />} onClick={() => ouvrirRecu(p.id)}>
                  Voir le reçu
                </Button>
                {peutAnnuler && (
                  <Button
                    size="xs"
                    variant="subtle"
                    color="red"
                    leftSection={<IconReceiptOff size={14} stroke={1.5} />}
                    onClick={() => setAAnnuler({ date: p.datePaiement, mode: p.mode, elements })}
                  >
                    Annuler
                  </Button>
                )}
              </Group>
            </Group>
          ))}
          {annules.map(({ a, libelles, montant }) => (
            <Text key={a.id} size="sm" c="dimmed">
              <Text span size="sm" td="line-through">
                {new Date(a.datePaiement).toLocaleDateString('fr-FR')} : {montant.toLocaleString('fr-FR')} GNF ({a.mode}) {libelles.join(' + ')}
              </Text>{' '}
              <Badge size="xs" color="red" variant="light">
                annulé le {new Date(a.annuleLe).toLocaleDateString('fr-FR')}
              </Badge>{' '}
              {a.motif}
            </Text>
          ))}
        </Paper>
      )}

      {Array.isArray(fiche.parentsLiens) && (
        <Filiation
          eleveId={id!}
          liens={fiche.parentsLiens}
          modifiable={user?.role === 'FONDATEUR' || user?.role === 'CHEF_ETABLISSEMENT' || user?.role === 'SECRETAIRE'}
        />
      )}

      {Array.isArray(fiche.factures) && (
        <PayerModal eleveId={id!} factures={factures} opened={paiementOuvert} onClose={() => setPaiementOuvert(false)} />
      )}
      {peutAnnuler && <AnnulationPaiementModal eleveId={id!} operation={aAnnuler} onClose={() => setAAnnuler(null)} />}
    </Stack>
  );
}
