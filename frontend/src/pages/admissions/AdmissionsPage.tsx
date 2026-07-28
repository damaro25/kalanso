import { useState } from 'react';
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
import { fetchClasses } from '../../api/classes';
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

export function AdmissionsPage() {
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
  const { data: classes } = useQuery({ queryKey: ['classes'], queryFn: fetchClasses });

  const [demandeAccept, setDemandeAccept] = useState<DemandeInscription | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [matricule, setMatricule] = useState('');

  const [demandeRefus, setDemandeRefus] = useState<DemandeInscription | null>(null);
  const [motifRefus, setMotifRefus] = useState('');

  const [demandeDocs, setDemandeDocs] = useState<DemandeInscription | null>(null);

  const [inscriptionOuverte, setInscriptionOuverte] = useState(false);
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
    mutationFn: () => accepterDemande(demandeAccept!.id, { classeId: classeId!, matricule: matricule || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      queryClient.invalidateQueries({ queryKey: ['eleves'] });
      notifications.show({ message: 'Demande acceptée, élève créé', color: 'green' });
      setDemandeAccept(null);
      setClasseId(null);
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

  const inscriptionMutation = useMutation({
    mutationFn: async () => {
      const demande = await inscrireSurPlace({
        ...inscription,
        dateNaissance: inscription.dateNaissance || undefined,
        lieuNaissance: inscription.lieuNaissance || undefined,
        niveauSouhaite: inscription.niveauSouhaite || undefined,
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
      return echecs;
    },
    onSuccess: (echecs) => {
      queryClient.invalidateQueries({ queryKey: ['demandes'] });
      if (echecs.length > 0) {
        notifications.show({
          message: `Élève placé en attente. Certains documents n'ont pas pu être envoyés : ${echecs.join(', ')}.`,
          color: 'orange',
        });
      } else {
        notifications.show({ message: "Élève ajouté à la liste d'attente des admissions", color: 'green' });
      }
      setInscriptionOuverte(false);
      setInscription(INSCRIPTION_DIRECTE_VIDE);
      setPiecesInscription([]);
      setFiltre('EN_ATTENTE');
    },
    onError: (error: any) => {
      notifications.show({ message: error?.response?.data?.message ?? 'Erreur', color: 'red' });
    },
  });

  const inscriptionValide =
    inscription.nomEleve.trim() &&
    inscription.prenomEleve.trim() &&
    inscription.nomParent.trim() &&
    inscription.prenomParent.trim() &&
    inscription.telephoneParent.trim();

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
          )}
        </>
      ) : (
        <>
      {isLoading && <p>Chargement...</p>}

      {demandes && demandes.length === 0 && <Text c="dimmed">Aucune demande dans cette catégorie.</Text>}

      {demandes && demandes.length > 0 && (
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
            data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
            value={classeId}
            onChange={setClasseId}
            required
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

      <Modal
        opened={inscriptionOuverte}
        onClose={() => {
          setInscriptionOuverte(false);
          setInscription(INSCRIPTION_DIRECTE_VIDE);
          setPiecesInscription([]);
          setFichierDocInscription(null);
        }}
        title="Inscription sur place"
        size="lg"
      >
        <Stack>
          <Text size="sm" c="dimmed">
            Pour un élève reçu directement au secrétariat. Crée une demande d'admission en attente,
            exactement comme le formulaire public : elle apparaîtra dans l'onglet « En attente » et
            devra être acceptée pour créer l'élève.
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
          <TextInput
            label="Niveau souhaité (optionnel)"
            placeholder="ex: CP1"
            value={inscription.niveauSouhaite}
            onChange={(e) => {
              const niveauSouhaite = e.currentTarget.value;
              setInscription((v) => ({ ...v, niveauSouhaite }));
            }}
          />

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
            <Select label="Type" data={TYPES_DOCUMENT} value={typeDocInscription} onChange={setTypeDocInscription} w={180} />
            <FileInput
              label="Fichier"
              placeholder="Choisir un fichier"
              accept={ACCEPT_FICHIERS}
              value={fichierDocInscription}
              onChange={setFichierDocInscription}
              w={220}
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
            Placer en attente{piecesInscription.length > 0 ? ` (${piecesInscription.length} document(s) joint(s))` : ''}
          </Button>
        </Stack>
      </Modal>

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
