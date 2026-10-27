import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Title,
  Table,
  Badge,
  Button,
  Group,
  Stack,
  Modal,
  Select,
  TextInput,
  Text,
  SegmentedControl,
  FileInput,
  ActionIcon,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  fetchDemandes,
  accepterDemande,
  refuserDemande,
  annulerAdmission,
  annulerRefus,
  fetchHistoriqueAnnulations,
  inscrireSurPlace,
  uploaderDocument,
  ouvrirDocument,
  telechargerDocument,
  verifierDocument,
  TYPES_DOCUMENT,
  type DemandeInscription,
  type InscriptionDirecteInput,
  type StatutDemande,
  type StatutDocument,
  type TypeDocument,
} from '../../api/admissions';
import { fetchClassesCourantes, fetchAnneesScolaires } from '../../api/classes';
import { REGIMES, type Regime } from '../../api/finances';
import { confirmerSuppression } from '../../lib/confirm';

const INSCRIPTION_DIRECTE_VIDE: InscriptionDirecteInput = {
  nomEleve: '',
  prenomEleve: '',
  genre: 'M',
  dateNaissance: '',
  lieuNaissance: '',
  niveauSouhaite: '',
  nomParent: '',
  prenomParent: '',
  telephoneParent: '',
  emailParent: '',
  perePrenom: '',
  pereNom: '',
  pereTelephone: '',
  pereProfession: '',
  merePrenom: '',
  mereNom: '',
  mereTelephone: '',
  mereProfession: '',
};

const ACCEPT_FICHIERS =
  'application/pdf,image/jpeg,image/png,image/gif,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PieceAJoindre {
  type: TypeDocument;
  fichier: File;
}

const STATUT_DOC_COLORS: Record<StatutDocument, string> = {
  EN_ATTENTE: 'gray',
  VERIFIE: 'green',
  REJETE: 'red',
};
const STATUT_DOC_LABELS: Record<StatutDocument, string> = {
  EN_ATTENTE: 'À vérifier',
  VERIFIE: 'Vérifié',
  REJETE: 'Rejeté',
};

const STATUT_COLORS: Record<StatutDemande, string> = {
  EN_ATTENTE: 'yellow',
  ACCEPTEE: 'green',
  REFUSEE: 'red',
};

const STATUT_LABELS: Record<StatutDemande, string> = {
  EN_ATTENTE: 'En attente',
  ACCEPTEE: 'Acceptée',
  REFUSEE: 'Refusée',
};

type Onglet = StatutDemande | 'HISTORIQUE';

export function AdmissionsPage({ ajoutSeul = false }: { ajoutSeul?: boolean }) {
  const queryClient = useQueryClient();
  const [filtre, setFiltre] = useState<Onglet>('EN_ATTENTE');

  const { data: demandes, isLoading } = useQuery({
    queryKey: ['demandes', filtre],
    queryFn: () => fetchDemandes(filtre as StatutDemande),
    enabled: filtre !== 'HISTORIQUE',
  });

  const { data: historique, isLoading: historiqueChargement } = useQuery({
    queryKey: ['historique-annulations'],
    queryFn: fetchHistoriqueAnnulations,
    enabled: filtre === 'HISTORIQUE',
  });
  // Une admission ne peut affecter l'élève qu'à une classe de l'année scolaire en cours :
  // proposer des classes d'années passées n'aurait pas de sens.
  const { data: classesAnneeCourante = [] } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes });
  const { data: annees } = useQuery({ queryKey: ['annees-scolaires'], queryFn: fetchAnneesScolaires });
  const anneeCourante = annees?.find((a) => a.courante) ?? annees?.[0];

  const [demandeAccept, setDemandeAccept] = useState<DemandeInscription | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [regime, setRegime] = useState<string | null>('EXTERNAT');
  const [matricule, setMatricule] = useState('');

  const [demandeRefus, setDemandeRefus] = useState<DemandeInscription | null>(null);
  const [motifRefus, setMotifRefus] = useState('');

  const [demandeDocs, setDemandeDocs] = useState<DemandeInscription | null>(null);

  // « Nouvel élève » depuis la liste des élèves : ouvre directement le formulaire (?nouveau=1).
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [inscriptionOuverte, setInscriptionOuverte] = useState(ajoutSeul || searchParams.get('nouveau') === '1');
  const [classeInscription, setClasseInscription] = useState<string | null>(null);
  const [regimeInscription, setRegimeInscription] = useState<string | null>('EXTERNAT');
  const [matriculeInscription, setMatriculeInscription] = useState('');
  const [inscription, setInscription] = useState<InscriptionDirecteInput>(INSCRIPTION_DIRECTE_VIDE);
  const [piecesInscription, setPiecesInscription] = useState<PieceAJoindre[]>([]);
  const [typeDocInscription, setTypeDocInscription] = useState<string | null>('PHOTO');
  const [fichierDocInscription, setFichierDocInscription] = useState<File | null>(null);

  function ajouterPieceInscription() {
    if (!typeDocInscription || !fichierDocInscription) return;
    setPiecesInscription((prev) => [...prev, { type: typeDocInscription as TypeDocument, fichier: fichierDocInscription }]);
    setFichierDocInscription(null);
  }

  function retirerPieceInscription(index: number) {
    setPiecesInscription((prev) => prev.filter((_, i) => i !== index));
  }

  const verifierMutation = useMutation({
    mutationFn: ({ id, statut }: { id: string; statut: 'VERIFIE' | 'REJETE' }) => verifierDocument(id, statut),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      notifications.show({
        message: variables.statut === 'VERIFIE' ? 'Document vérifié' : 'Document rejeté',
        color: variables.statut === 'VERIFIE' ? 'green' : 'orange',
      });
      setDemandeDocs((prev) =>
        prev
          ? {
              ...prev,
              documents: prev.documents.map((doc) =>
                doc.id === variables.id ? { ...doc, statut: variables.statut } : doc,
              ),
            }
          : prev,
      );
    },
    onError: (error: any) => notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' }),
  });

  const accepterMutation = useMutation({
    mutationFn: () =>
      accepterDemande(demandeAccept!.id, {
        classeId: classeId!,
        regime: (regime ?? undefined) as Regime | undefined,
        matricule: matricule || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      notifications.show({ message: 'Demande acceptée, élève créé', color: 'green' });
      setDemandeAccept(null);
      setClasseId(null);
      setRegime('EXTERNAT');
      setMatricule('');
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  const refuserMutation = useMutation({
    mutationFn: () => refuserDemande(demandeRefus!.id, motifRefus || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      notifications.show({ message: 'Demande refusée', color: 'orange' });
      setDemandeRefus(null);
      setMotifRefus('');
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  const annulerMutation = useMutation({
    mutationFn: (id: string) => annulerAdmission(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      queryClient.invalidateQueries({ queryKey: ['historique-annulations'] });
      notifications.show({ message: "Admission annulée, l'élève et ses données ont été supprimés", color: 'orange' });
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  function confirmerAnnulation(d: DemandeInscription) {
    confirmerSuppression({
      titre: "Annuler l'admission",
      message: (
        <Text size="sm">
          Voulez-vous vraiment annuler l'admission de <strong>{d.prenomEleve} {d.nomEleve}</strong> ?
          <br />
          <br />
          L'élève, ainsi que toutes ses factures, paiements, notes et absences seront{' '}
          <strong>définitivement supprimés</strong>. Seule la demande d'admission est conservée — elle
          repasse en « En attente ».
        </Text>
      ),
      onConfirm: () => annulerMutation.mutate(d.id),
    });
  }

  const annulerRefusMutation = useMutation({
    mutationFn: (id: string) => annulerRefus(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      queryClient.invalidateQueries({ queryKey: ['historique-annulations'] });
      notifications.show({ message: 'Demande remise en attente', color: 'green' });
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  function fermerInscription() {
    if (ajoutSeul) {
      navigate('/eleves');
      return;
    }
    setInscriptionOuverte(false);
    setInscription(INSCRIPTION_DIRECTE_VIDE);
    setPiecesInscription([]);
    setFichierDocInscription(null);
    setClasseInscription(null);
    setRegimeInscription('EXTERNAT');
    setMatriculeInscription('');
  }

  // Élève reçu au secrétariat : inscrit directement dans sa classe, sans passer par la liste d'attente.
  // La demande d'admission est créée (pièces jointes, historique) puis acceptée aussitôt.
  const inscriptionMutation = useMutation({
    mutationFn: async () => {
      const classe = classesAnneeCourante.find((c) => c.id === classeInscription);
      const demande = await inscrireSurPlace({
        ...inscription,
        dateNaissance: inscription.dateNaissance || undefined,
        lieuNaissance: inscription.lieuNaissance || undefined,
        niveauSouhaite: classe?.niveau.nom,
        emailParent: inscription.emailParent || undefined,
      });

      const echecs: string[] = [];
      for (const piece of piecesInscription) {
        try {
          await uploaderDocument(demande.id, piece.type, piece.fichier);
        } catch {
          echecs.push(piece.fichier.name);
        }
      }

      try {
        const { eleve } = await accepterDemande(demande.id, {
          classeId: classeInscription!,
          regime: (regimeInscription ?? undefined) as Regime | undefined,
          matricule: matriculeInscription.trim() || undefined,
        });
        return { echecs, eleveId: eleve.id as string, classe: classe?.nom ?? '' };
      } catch (error: any) {
        // L'élève n'a pas pu être inscrit (matricule déjà pris...) : sa demande reste en attente, rien n'est perdu.
        throw new Error(
          `${error?.response?.data?.message ?? "L'inscription a échoué"}. La demande est conservée dans « En attente ».`,
        );
      }
    },
    onSuccess: ({ echecs, eleveId, classe }) => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      queryClient.invalidateQueries({ queryKey: ['effectifs'] });
      notifications.show({
        message:
          echecs.length > 0
            ? `Élève inscrit en ${classe}. Certains documents n'ont pas pu être envoyés : ${echecs.join(', ')}.`
            : `Élève inscrit en ${classe}`,
        color: echecs.length > 0 ? 'orange' : 'green',
      });
      setInscriptionOuverte(false);
      setInscription(INSCRIPTION_DIRECTE_VIDE);
      setPiecesInscription([]);
      navigate(`/eleves/${eleveId}`);
    },
    onError: (error: any) => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      notifications.show({ message: error?.response?.data?.message ?? error?.message ?? 'Erreur', color: 'red' });
    },
  });

  const inscriptionValide =
    inscription.nomEleve.trim() &&
    inscription.prenomEleve.trim() &&
    inscription.nomParent.trim() &&
    inscription.prenomParent.trim() &&
    inscription.telephoneParent.trim() &&
    classeInscription;

  const modalInscription = (
    <Modal
      opened={inscriptionOuverte}
      onClose={fermerInscription}
      title={ajoutSeul ? "Nouvel élève" : "Inscription sur place"}
      size="lg"
    >
      <Stack>
        <Text size="sm" c="dimmed">
          Pour un élève reçu directement au secrétariat : il est inscrit tout de suite dans la classe
          choisie, sans passer par la liste d'attente. Ses frais d'inscription et d'écolage sont facturés.
        </Text>
        <Group grow>
          <TextInput
            label="Nom de l'élève"
            value={inscription.nomEleve}
            onChange={(e) => {
              const nomEleve = e.currentTarget.value;
              setInscription((v) => ({ ...v, nomEleve }));
            }}
            required
          />
          <TextInput
            label="Prénom de l'élève"
            value={inscription.prenomEleve}
            onChange={(e) => {
              const prenomEleve = e.currentTarget.value;
              setInscription((v) => ({ ...v, prenomEleve }));
            }}
            required
          />
        </Group>
        <Group grow>
          <Select
            label="Genre"
            data={[
              { value: 'M', label: 'Garçon' },
              { value: 'F', label: 'Fille' },
            ]}
            value={inscription.genre}
            onChange={(v) => setInscription((prev) => ({ ...prev, genre: (v as 'M' | 'F') ?? 'M' }))}
          />
          <TextInput
            label="Date de naissance (optionnel)"
            type="date"
            value={inscription.dateNaissance}
            onChange={(e) => {
              const dateNaissance = e.currentTarget.value;
              setInscription((v) => ({ ...v, dateNaissance }));
            }}
          />
        </Group>
        <TextInput
          label="Lieu de naissance (optionnel)"
          value={inscription.lieuNaissance}
          onChange={(e) => {
            const lieuNaissance = e.currentTarget.value;
            setInscription((v) => ({ ...v, lieuNaissance }));
          }}
        />
        <Text fw={600} size="sm" mt="sm">
          Classe
        </Text>
        <Group grow align="flex-start">
          <Select
            label="Classe"
            placeholder="Choisir une classe"
            description={anneeCourante ? `Année scolaire ${anneeCourante.libelle}` : undefined}
            data={classesAnneeCourante.map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
            value={classeInscription}
            onChange={setClasseInscription}
            searchable
            required
          />
          <Select
            label="Régime"
            description="Détermine les tarifs d'écolage"
            data={REGIMES}
            value={regimeInscription}
            onChange={setRegimeInscription}
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label="Matricule (optionnel)"
          value={matriculeInscription}
          onChange={(e) => setMatriculeInscription(e.currentTarget.value)}
        />

        <Text fw={600} size="sm" mt="sm">
          Parent / tuteur
        </Text>
        <Group grow>
          <TextInput
            label="Nom du parent"
            value={inscription.nomParent}
            onChange={(e) => {
              const nomParent = e.currentTarget.value;
              setInscription((v) => ({ ...v, nomParent }));
            }}
            required
          />
          <TextInput
            label="Prénom du parent"
            value={inscription.prenomParent}
            onChange={(e) => {
              const prenomParent = e.currentTarget.value;
              setInscription((v) => ({ ...v, prenomParent }));
            }}
            required
          />
        </Group>
        <Group grow>
          <TextInput
            label="Téléphone du parent"
            value={inscription.telephoneParent}
            onChange={(e) => {
              const telephoneParent = e.currentTarget.value;
              setInscription((v) => ({ ...v, telephoneParent }));
            }}
            required
          />
          <TextInput
            label="Email du parent (optionnel)"
            value={inscription.emailParent}
            onChange={(e) => {
              const emailParent = e.currentTarget.value;
              setInscription((v) => ({ ...v, emailParent }));
            }}
          />
        </Group>

        <Text fw={600} size="sm" mt="sm">
          Documents (photo, relevé de notes, extrait de naissance...)
        </Text>
        <Text size="xs" c="dimmed">
          Formats acceptés : PDF, images (JPG, PNG, GIF, WEBP, HEIC) et Word (DOC, DOCX). 10 Mo maximum par fichier.
        </Text>

        {piecesInscription.length > 0 && (
          <Stack gap="xs">
            {piecesInscription.map((p, i) => (
              <Group key={i} gap="xs">
                <Badge color="blue" variant="light">
                  {TYPES_DOCUMENT.find((t) => t.value === p.type)?.label ?? p.type}
                </Badge>
                <Text size="sm" style={{ flex: 1 }}>
                  {p.fichier.name}
                </Text>
                <ActionIcon color="red" variant="subtle" onClick={() => retirerPieceInscription(i)} aria-label="Retirer">
                  ✕
                </ActionIcon>
              </Group>
            ))}
          </Stack>
        )}

        <Group align="flex-end">
          <Select label="Type" data={TYPES_DOCUMENT} value={typeDocInscription} onChange={setTypeDocInscription} w={{ base: '100%', sm: 180 }} />
          <FileInput
            label="Fichier"
            placeholder="Choisir un fichier"
            accept={ACCEPT_FICHIERS}
            value={fichierDocInscription}
            onChange={setFichierDocInscription}
            w={{ base: '100%', sm: 220 }}
          />
          <Button variant="light" disabled={!typeDocInscription || !fichierDocInscription} onClick={ajouterPieceInscription}>
            Ajouter le document
          </Button>
        </Group>

        <Button
          disabled={!inscriptionValide}
          loading={inscriptionMutation.isPending}
          onClick={() => inscriptionMutation.mutate()}
        >
          Inscrire l'élève{piecesInscription.length > 0 ? ` (${piecesInscription.length} document(s) joint(s))` : ''}
        </Button>
      </Stack>
    </Modal>
  );

  // Admissions désactivées : la page ne sert plus qu'au formulaire « Nouvel élève » (route /eleves/nouveau).
  if (ajoutSeul) return modalInscription;

  return (
    <Stack>
      <Group justify="space-between">
        <Title order={2}>Demandes d'inscription</Title>
        <Button variant="light" onClick={() => setInscriptionOuverte(true)}>
          Inscription sur place
        </Button>
      </Group>

      <SegmentedControl
        value={filtre}
        onChange={(v) => setFiltre(v as Onglet)}
        data={[
          { label: 'En attente', value: 'EN_ATTENTE' },
          { label: 'Acceptées', value: 'ACCEPTEE' },
          { label: 'Refusées', value: 'REFUSEE' },
          { label: 'Historique des annulations', value: 'HISTORIQUE' },
        ]}
      />

      {filtre === 'HISTORIQUE' ? (
        <>
          {historiqueChargement && <p>Chargement...</p>}
          {historique && historique.length === 0 && (
            <Text c="dimmed">Aucune annulation enregistrée.</Text>
          )}
          {historique && historique.length > 0 && (
            <Table.ScrollContainer minWidth={620}>
              <Table striped highlightOnHover>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>Date</Table.Th>
                    <Table.Th>Élève</Table.Th>
                    <Table.Th>Type</Table.Th>
                    <Table.Th>Détail</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {historique.map((h) => (
                    <Table.Tr key={h.id}>
                      <Table.Td>{new Date(h.createdAt).toLocaleString('fr-FR')}</Table.Td>
                      <Table.Td>
                        {h.prenomEleve} {h.nomEleve}
                      </Table.Td>
                      <Table.Td>
                        <Badge color={h.type === 'ADMISSION' ? 'red' : 'gray'}>
                          {h.type === 'ADMISSION' ? 'Admission annulée' : 'Refus annulé'}
                        </Badge>
                      </Table.Td>
                      <Table.Td>{h.detail ?? '—'}</Table.Td>
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </Table.ScrollContainer>
          )}
        </>
      ) : (
        <>
      {isLoading && <p>Chargement...</p>}

      {demandes && demandes.length === 0 && <Text c="dimmed">Aucune demande dans cette catégorie.</Text>}

      {demandes && demandes.length > 0 && (
        <Table.ScrollContainer minWidth={620}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Élève</Table.Th>
                <Table.Th>Niveau souhaité</Table.Th>
                <Table.Th>Parent</Table.Th>
                <Table.Th>Téléphone</Table.Th>
                <Table.Th>Statut</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {demandes.map((d) => (
                <Table.Tr key={d.id}>
                  <Table.Td>
                    {d.prenomEleve} {d.nomEleve} ({d.genre})
                  </Table.Td>
                  <Table.Td>{d.niveau?.nom ?? d.niveauSouhaite ?? '—'}</Table.Td>
                  <Table.Td>
                    {d.prenomParent} {d.nomParent}
                  </Table.Td>
                  <Table.Td>{d.telephoneParent}</Table.Td>
                  <Table.Td>
                    <Badge color={STATUT_COLORS[d.statut]}>{STATUT_LABELS[d.statut]}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="xs" variant="light" onClick={() => setDemandeDocs(d)}>
                        Documents ({d.documents.length})
                      </Button>
                      {d.statut === 'EN_ATTENTE' && (
                        <>
                          <Button size="xs" color="green" onClick={() => setDemandeAccept(d)}>
                            Accepter
                          </Button>
                          <Button size="xs" variant="light" color="red" onClick={() => setDemandeRefus(d)}>
                            Refuser
                          </Button>
                        </>
                      )}
                      {d.statut === 'ACCEPTEE' && (
                        <Button
                          size="xs"
                          variant="light"
                          color="red"
                          loading={annulerMutation.isPending}
                          onClick={() => confirmerAnnulation(d)}
                        >
                          Annuler l'admission
                        </Button>
                      )}
                      {d.statut === 'REFUSEE' && (
                        <>
                          {d.motifRefus && (
                            <Text size="sm" c="dimmed">
                              Motif : {d.motifRefus}
                            </Text>
                          )}
                          <Button
                            size="xs"
                            variant="light"
                            loading={annulerRefusMutation.isPending}
                            onClick={() => annulerRefusMutation.mutate(d.id)}
                          >
                            Remettre en attente
                          </Button>
                        </>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
        </>
      )}

      <Modal
        opened={!!demandeAccept}
        onClose={() => {
          setDemandeAccept(null);
          setClasseId(null);
          setMatricule('');
        }}
        title="Accepter la demande"
      >
        <Stack>
          {demandeAccept && (
            <Text size="sm">
              Créer l'élève <strong>{demandeAccept.prenomEleve} {demandeAccept.nomEleve}</strong> et son parent.
              Un élève accepté doit être affecté à une classe.
            </Text>
          )}
          <Select
            label="Classe"
            placeholder="Choisir une classe"
            description={anneeCourante ? `Année scolaire ${anneeCourante.libelle}` : undefined}
            data={classesAnneeCourante.map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
            value={classeId}
            onChange={setClasseId}
            required
          />
          <Select
            label="Régime"
            description="Détermine les tarifs d'écolage facturés à l'élève"
            data={REGIMES}
            value={regime}
            onChange={setRegime}
            allowDeselect={false}
          />
          <TextInput
            label="Matricule (optionnel)"
            value={matricule}
            onChange={(e) => setMatricule(e.currentTarget.value)}
          />
          <Button disabled={!classeId} loading={accepterMutation.isPending} onClick={() => accepterMutation.mutate()}>
            Confirmer l'acceptation
          </Button>
        </Stack>
      </Modal>

      <Modal opened={!!demandeRefus} onClose={() => setDemandeRefus(null)} title="Refuser la demande">
        <Stack>
          <TextInput
            label="Motif du refus (optionnel)"
            value={motifRefus}
            onChange={(e) => setMotifRefus(e.currentTarget.value)}
          />
          <Button color="red" loading={refuserMutation.isPending} onClick={() => refuserMutation.mutate()}>
            Confirmer le refus
          </Button>
        </Stack>
      </Modal>

      {modalInscription}

      <Modal
        opened={!!demandeDocs}
        onClose={() => setDemandeDocs(null)}
        title="Documents de la demande"
        size="lg"
      >
        <Stack>
          {demandeDocs && demandeDocs.documents.length === 0 && (
            <Text c="dimmed">Aucun document joint à cette demande.</Text>
          )}
          {demandeDocs?.documents.map((doc) => (
            <Group key={doc.id} justify="space-between" wrap="nowrap">
              <div>
                <Group gap="xs">
                  <Badge variant="light">{TYPES_DOCUMENT.find((t) => t.value === doc.type)?.label ?? doc.type}</Badge>
                  <Badge color={STATUT_DOC_COLORS[doc.statut]}>{STATUT_DOC_LABELS[doc.statut]}</Badge>
                </Group>
                <Text size="sm" mt={4}>
                  {doc.nomFichier} ({Math.round(doc.tailleOctets / 1024)} Ko)
                </Text>
              </div>
              <Group gap="xs" wrap="nowrap">
                <Button size="xs" variant="subtle" onClick={() => ouvrirDocument(doc.id, doc.mimeType)}>
                  Aperçu
                </Button>
                <Button size="xs" variant="light" onClick={() => telechargerDocument(doc.id, doc.nomFichier)}>
                  Télécharger
                </Button>
                <Button
                  size="xs"
                  color="green"
                  loading={verifierMutation.isPending}
                  onClick={() => verifierMutation.mutate({ id: doc.id, statut: 'VERIFIE' })}
                >
                  Vérifier
                </Button>
                <Button
                  size="xs"
                  color="red"
                  variant="light"
                  loading={verifierMutation.isPending}
                  onClick={() => verifierMutation.mutate({ id: doc.id, statut: 'REJETE' })}
                >
                  Rejeter
                </Button>
              </Group>
            </Group>
          ))}
        </Stack>
      </Modal>
    </Stack>
  );
}
