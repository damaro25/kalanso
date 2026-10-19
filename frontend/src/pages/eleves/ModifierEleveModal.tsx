import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Divider, Group, Loader, Modal, Select, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  fetchEleveFiche,
  inscrireEleve,
  modifierEleve,
  modifierFiliation,
  type ContactPrincipal,
  type Eleve,
} from '../../api/eleves';
import { fetchClassesCourantes } from '../../api/classes';
import { REGIMES, type Regime } from '../../api/finances';
import { ChampsPersonne, PERSONNE_VIDE, type Personne } from '../../components/ChampsFiliation';
import { DossierEleve } from './DossierEleve';

interface Identite {
  nom: string;
  prenom: string;
  genre: 'M' | 'F';
  matricule: string;
  dateNaissance: string;
  lieuNaissance: string;
  adresse: string;
}

const CONTACT_VIDE: ContactPrincipal = { prenom: '', nom: '', telephone: '', email: '', lien: 'Parent' };

function personneDe(lien: any): Personne {
  const p = lien?.parentTuteur;
  return p ? { prenom: p.prenom ?? '', nom: p.nom ?? '', telephone: p.telephone ?? '', profession: p.profession ?? '' } : PERSONNE_VIDE;
}

// « Modifier » (liste des élèves) : toutes les informations de l'élève en une fois : identité, classe et régime de
// l'année en cours, parent / tuteur à contacter, père et mère, pièces du dossier.
export function ModifierEleveModal({ eleve, onClose }: { eleve: Eleve | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const { data: fiche, isLoading } = useQuery({
    queryKey: ['eleve-fiche', eleve?.id],
    queryFn: () => fetchEleveFiche(eleve!.id),
    enabled: !!eleve,
  });
  const { data: classes } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes, enabled: !!eleve });

  const [identite, setIdentite] = useState<Identite | null>(null);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [regime, setRegime] = useState<string | null>(null);
  const [contact, setContact] = useState<ContactPrincipal>(CONTACT_VIDE);
  const [pere, setPere] = useState<Personne>(PERSONNE_VIDE);
  const [mere, setMere] = useState<Personne>(PERSONNE_VIDE);

  // Remplit le formulaire avec la fiche de l'élève à chaque ouverture
  useEffect(() => {
    if (!eleve || !fiche || fiche.id !== eleve.id) {
      setIdentite(null);
      return;
    }
    setIdentite({
      nom: fiche.nom ?? '',
      prenom: fiche.prenom ?? '',
      genre: fiche.genre ?? 'M',
      matricule: fiche.matricule ?? '',
      dateNaissance: fiche.dateNaissance ? String(fiche.dateNaissance).slice(0, 10) : '',
      lieuNaissance: fiche.lieuNaissance ?? '',
      adresse: fiche.adresse ?? '',
    });
    const inscription = fiche.inscriptions?.[0];
    setClasseId(inscription?.classeId ?? inscription?.classe?.id ?? null);
    setRegime(inscription?.regime ?? 'EXTERNAT');
    const liens: any[] = fiche.parentsLiens ?? [];
    const lienContact = liens.find((l) => l.contactPrincipal);
    setContact(
      lienContact
        ? {
            prenom: lienContact.parentTuteur.prenom ?? '',
            nom: lienContact.parentTuteur.nom ?? '',
            telephone: lienContact.parentTuteur.telephone ?? '',
            email: lienContact.parentTuteur.email ?? '',
            lien: lienContact.lien ?? 'Parent',
          }
        : CONTACT_VIDE,
    );
    setPere(personneDe(liens.find((l) => l.lien === 'Père')));
    setMere(personneDe(liens.find((l) => l.lien === 'Mère')));
  }, [eleve, fiche]);

  const inscriptionActuelle = fiche?.inscriptions?.[0];
  const classeChangee = !!classeId && (classeId !== (inscriptionActuelle?.classeId ?? inscriptionActuelle?.classe?.id) || regime !== inscriptionActuelle?.regime);

  const enregistrer = useMutation({
    mutationFn: async () => {
      await modifierEleve(eleve!.id, identite!);
      await modifierFiliation(eleve!.id, {
        pere,
        mere,
        ...(contact.prenom.trim() && contact.nom.trim() ? { contact } : {}),
      });
      if (classeChangee) await inscrireEleve(eleve!.id, classeId!, (regime ?? undefined) as Regime | undefined);
    },
    onSuccess: () => {
      for (const cle of ['eleves', 'eleve-fiche', 'classes', 'factures-impayes', 'effectifs']) queryClient.invalidateQueries({ queryKey: [cle] });
      notifications.show({ message: 'Élève modifié', color: 'green' });
      onClose();
    },
    onError: (e: any) => notifications.show({ message: e?.response?.data?.message ?? 'Erreur lors de la modification', color: 'red' }),
  });

  const champ = (cle: keyof Identite, label: string, o: { type?: string; requis?: boolean } = {}) => (
    <TextInput
      label={label}
      type={o.type}
      required={o.requis}
      value={identite?.[cle] ?? ''}
      onChange={(e) => {
        const v = e.currentTarget.value;
        setIdentite((i) => i && { ...i, [cle]: v });
      }}
    />
  );

  return (
    <Modal opened={!!eleve} onClose={onClose} title={eleve ? `Modifier : ${eleve.prenom} ${eleve.nom}` : ''} size="xl">
      {(isLoading || !identite) && (
        <Group justify="center" p="xl">
          <Loader />
        </Group>
      )}
      {identite && (
        <Stack>
          <Text fw={600} size="sm">
            Identité
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {champ('nom', "Nom de l'élève", { requis: true })}
            {champ('prenom', "Prénom de l'élève", { requis: true })}
            <Select
              label="Genre"
              data={[
                { value: 'M', label: 'Garçon' },
                { value: 'F', label: 'Fille' },
              ]}
              value={identite.genre}
              onChange={(v) => setIdentite((i) => i && { ...i, genre: (v as 'M' | 'F') ?? 'M' })}
              allowDeselect={false}
            />
            {champ('matricule', 'Matricule')}
            {champ('dateNaissance', 'Date de naissance', { type: 'date' })}
            {champ('lieuNaissance', 'Lieu de naissance')}
          </SimpleGrid>
          {champ('adresse', 'Adresse')}

          <Divider />
          <Text fw={600} size="sm">
            Classe et régime (année en cours)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label="Classe"
              placeholder="Choisir une classe"
              data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
              value={classeId}
              onChange={setClasseId}
              searchable
            />
            <Select label="Régime" data={REGIMES} value={regime} onChange={setRegime} allowDeselect={false} />
          </SimpleGrid>
          {classeChangee && (
            <Alert color="orange" variant="light">
              Changer de classe ou de régime ajuste les frais d'écolage de l'élève pour l'année (comme une nouvelle inscription).
            </Alert>
          )}

          <Divider />
          <Text fw={600} size="sm">
            Parent / tuteur à contacter (SMS, rappels)
          </Text>
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            {(
              [
                ['prenom', 'Prénom'],
                ['nom', 'Nom'],
                ['telephone', 'Téléphone'],
                ['email', 'Email'],
                ['lien', 'Lien (Parent, Oncle, Tuteur...)'],
              ] as [keyof ContactPrincipal, string][]
            ).map(([cle, label]) => (
              <TextInput
                key={cle}
                label={label}
                value={contact[cle]}
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  setContact((c) => ({ ...c, [cle]: v }));
                }}
              />
            ))}
          </SimpleGrid>

          <Divider />
          <ChampsPersonne titre="Père" valeur={pere} onChange={setPere} />
          <ChampsPersonne titre="Mère" valeur={mere} onChange={setMere} />
          <Text size="xs" c="dimmed">
            Laisser prénom et nom vides retire le père ou la mère de la fiche.
          </Text>

          <Divider />
          <Text fw={600} size="sm">
            Dossier (pièces de l'élève)
          </Text>
          <DossierEleve eleveId={eleve!.id} />

          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              Annuler
            </Button>
            <Button
              loading={enregistrer.isPending}
              disabled={!identite.nom.trim() || !identite.prenom.trim()}
              onClick={() => enregistrer.mutate()}
            >
              Enregistrer
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
