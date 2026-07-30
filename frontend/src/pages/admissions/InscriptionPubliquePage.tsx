import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Container,
  Title,
  Text,
  Paper,
  Stack,
  TextInput,
  Select,
  Button,
  Alert,
  Group,
  FileInput,
  Badge,
  ActionIcon,
} from '@mantine/core';
import {
  fetchEcolePublique,
  soumettreDemande,
  uploaderDocument,
  TYPES_DOCUMENT,
  type TypeDocument,
} from '../../api/admissions';

const ACCEPT_FICHIERS =
  'application/pdf,image/jpeg,image/png,image/gif,image/webp,image/heic,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

interface PieceAJoindre {
  type: TypeDocument;
  fichier: File;
}

export function InscriptionPubliquePage() {
  const { ecoleId } = useParams<{ ecoleId: string }>();

  const { data: ecole, isLoading, isError } = useQuery({
    queryKey: ['ecole-publique', ecoleId],
    queryFn: () => fetchEcolePublique(ecoleId!),
    enabled: !!ecoleId,
    retry: false,
  });

  const [nomEleve, setNomEleve] = useState('');
  const [prenomEleve, setPrenomEleve] = useState('');
  const [genre, setGenre] = useState<string | null>('M');
  const [dateNaissance, setDateNaissance] = useState('');
  const [lieuNaissance, setLieuNaissance] = useState('');
  const [niveauId, setNiveauId] = useState<string | null>(null);
  const [nomParent, setNomParent] = useState('');
  const [prenomParent, setPrenomParent] = useState('');
  const [telephoneParent, setTelephoneParent] = useState('');
  const [emailParent, setEmailParent] = useState('');

  // Documents attachés avant l'envoi
  const [pieces, setPieces] = useState<PieceAJoindre[]>([]);
  const [typeDoc, setTypeDoc] = useState<string | null>('ATTESTATION');
  const [fichierDoc, setFichierDoc] = useState<File | null>(null);

  const [erreurDocs, setErreurDocs] = useState<string[]>([]);

  function ajouterPiece() {
    if (!typeDoc || !fichierDoc) return;
    setPieces((prev) => [...prev, { type: typeDoc as TypeDocument, fichier: fichierDoc }]);
    setFichierDoc(null);
  }

  function retirerPiece(index: number) {
    setPieces((prev) => prev.filter((_, i) => i !== index));
  }

  const mutation = useMutation({
    mutationFn: async () => {
      const demande = await soumettreDemande({
        ecoleId: ecoleId!,
        nomEleve,
        prenomEleve,
        genre: genre as 'M' | 'F',
        dateNaissance: dateNaissance || undefined,
        lieuNaissance: lieuNaissance || undefined,
        niveauId: niveauId || undefined,
        nomParent,
        prenomParent,
        telephoneParent,
        emailParent: emailParent || undefined,
      });

      const echecs: string[] = [];
      for (const piece of pieces) {
        try {
          await uploaderDocument(demande.id, piece.type, piece.fichier);
        } catch {
          echecs.push(piece.fichier.name);
        }
      }
      setErreurDocs(echecs);
      return demande;
    },
  });

  if (isLoading) return <Text ta="center" mt="xl">Chargement...</Text>;
  if (isError || !ecole)
    return (
      <Container size="sm" mt="xl">
        <Alert color="red" title="École introuvable">
          Le lien d'inscription est invalide. Vérifiez l'adresse fournie par l'établissement.
        </Alert>
      </Container>
    );

  if (mutation.isSuccess) {
    return (
      <Container size="sm" my="xl">
        <Alert color="green" title="Demande envoyée">
          Votre demande d'inscription pour <strong>{prenomEleve} {nomEleve}</strong> a bien été transmise à{' '}
          {ecole.nom}
          {pieces.length > 0 && erreurDocs.length === 0
            ? ` avec ${pieces.length} document(s) joint(s)`
            : ''}
          . L'établissement vérifiera votre dossier puis vous contactera au numéro fourni.
        </Alert>
        {erreurDocs.length > 0 && (
          <Alert color="orange" title="Certains documents n'ont pas pu être envoyés" mt="md">
            {erreurDocs.join(', ')}. Vous pourrez les re-transmettre à l'établissement.
          </Alert>
        )}
      </Container>
    );
  }

  const formulaireValide = nomEleve && prenomEleve && genre && nomParent && prenomParent && telephoneParent;

  return (
    <Container size="sm" my="xl">
      <Title order={2}>Demande d'inscription</Title>
      <Text c="dimmed" mb="lg">
        {ecole.nom}
        {ecole.ville ? ` — ${ecole.ville}` : ''}
      </Text>

      <Paper withBorder p="lg">
        <Stack>
          <Title order={4}>Informations de l'élève</Title>
          <TextInput label="Nom" required value={nomEleve} onChange={(e) => setNomEleve(e.currentTarget.value)} />
          <TextInput label="Prénom" required value={prenomEleve} onChange={(e) => setPrenomEleve(e.currentTarget.value)} />
          <Select
            label="Genre"
            required
            data={[
              { value: 'M', label: 'Garçon' },
              { value: 'F', label: 'Fille' },
            ]}
            value={genre}
            onChange={setGenre}
          />
          <TextInput
            label="Date de naissance"
            type="date"
            value={dateNaissance}
            onChange={(e) => setDateNaissance(e.currentTarget.value)}
          />
          <TextInput label="Lieu de naissance" value={lieuNaissance} onChange={(e) => setLieuNaissance(e.currentTarget.value)} />
          <Select
            label="Niveau souhaité"
            placeholder="Choisir un niveau"
            data={ecole.niveaux.map((n) => ({ value: n.id, label: n.nom }))}
            value={niveauId}
            onChange={setNiveauId}
            clearable
          />

          <Title order={4} mt="md">Parent / tuteur</Title>
          <TextInput label="Nom" required value={nomParent} onChange={(e) => setNomParent(e.currentTarget.value)} />
          <TextInput label="Prénom" required value={prenomParent} onChange={(e) => setPrenomParent(e.currentTarget.value)} />
          <TextInput
            label="Téléphone"
            required
            placeholder="ex: 628112233"
            value={telephoneParent}
            onChange={(e) => setTelephoneParent(e.currentTarget.value)}
          />
          <TextInput label="Email (optionnel)" value={emailParent} onChange={(e) => setEmailParent(e.currentTarget.value)} />

          <Title order={4} mt="md">Documents (attestations, relevés de notes...)</Title>
          <Text size="sm" c="dimmed">
            Formats acceptés : PDF, images (JPG, PNG, GIF, WEBP, HEIC) et Word (DOC, DOCX). 10 Mo maximum par fichier.
          </Text>

          {pieces.length > 0 && (
            <Stack gap="xs">
              {pieces.map((p, i) => (
                <Group key={i} gap="xs">
                  <Badge color="blue" variant="light">
                    {TYPES_DOCUMENT.find((t) => t.value === p.type)?.label ?? p.type}
                  </Badge>
                  <Text size="sm" style={{ flex: 1 }}>
                    {p.fichier.name}
                  </Text>
                  <ActionIcon color="red" variant="subtle" onClick={() => retirerPiece(i)} aria-label="Retirer">
                    ✕
                  </ActionIcon>
                </Group>
              ))}
            </Stack>
          )}

          <Group align="flex-end">
            <Select label="Type" data={TYPES_DOCUMENT} value={typeDoc} onChange={setTypeDoc} w={200} />
            <FileInput
              label="Fichier"
              placeholder="Choisir un fichier"
              accept={ACCEPT_FICHIERS}
              value={fichierDoc}
              onChange={setFichierDoc}
              w={220}
            />
            <Button variant="light" disabled={!typeDoc || !fichierDoc} onClick={ajouterPiece}>
              Ajouter le document
            </Button>
          </Group>

          {mutation.isError && (
            <Alert color="red">Une erreur est survenue lors de l'envoi. Vérifiez les champs et réessayez.</Alert>
          )}

          <Button disabled={!formulaireValide} loading={mutation.isPending} onClick={() => mutation.mutate()}>
            Envoyer la demande{pieces.length > 0 ? ` (${pieces.length} document(s) joint(s))` : ''}
          </Button>
        </Stack>
      </Paper>
    </Container>
  );
}
