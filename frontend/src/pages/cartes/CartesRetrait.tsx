import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Button, Group, MultiSelect, Paper, Select, Stack, Switch, Text, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconId } from '@tabler/icons-react';
import { fetchClassesRetrait, messageErreurCarte, ouvrirCartesRetraitClasse, ouvrirCartesRetraitEleves } from '../../api/cartes';
import { fetchEleves } from '../../api/eleves';

// Cartes de retrait des enfants (maternelle) : planche A4 de 8 cartes, comme le modèle papier. Par classe (la
// maternelle par défaut) ou pour des élèves choisis. En-tête et signataire : Établissement > Configuration.
export function CartesRetrait() {
  const [toutesClasses, setToutesClasses] = useState(false);
  const [classeId, setClasseId] = useState<string | null>(null);
  const [eleveIds, setEleveIds] = useState<string[]>([]);

  const { data } = useQuery({ queryKey: ['cartes-retrait-classes'], queryFn: fetchClassesRetrait });
  const { data: eleves } = useQuery({ queryKey: ['eleves'], queryFn: () => fetchEleves() });

  const classes = (data?.classes ?? []).filter((c) => toutesClasses || c.maternelle);
  const classe = data?.classes.find((c) => c.id === classeId);

  const erreur = async (e: unknown) => notifications.show({ message: await messageErreurCarte(e, 'Impossible de générer les cartes'), color: 'red' });
  const parClasse = useMutation({ mutationFn: () => ouvrirCartesRetraitClasse(classeId!), onError: erreur });
  const parEleves = useMutation({ mutationFn: () => ouvrirCartesRetraitEleves(eleveIds), onError: erreur });

  return (
    <Stack>
      <Text c="dimmed" size="sm">
        Planche A4 de 8 cartes (95 × 68 mm), à imprimer puis découper le long du cadre. L'en-tête (MEN-A, DEV, DCE) et le
        signataire se règlent dans Établissement &gt; Configuration.
      </Text>

      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Par classe
        </Title>
        <Group gap="sm" align="flex-end">
          <Select
            label="Classe"
            placeholder={classes.length ? 'Choisir une classe' : 'Aucune classe de maternelle'}
            data={classes.map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau}) · ${c.effectif} élève${c.effectif > 1 ? 's' : ''}` }))}
            value={classeId}
            onChange={setClasseId}
            searchable
            w={{ base: '100%', sm: 320 }}
          />
          <Button
            leftSection={<IconId size={16} stroke={1.5} />}
            disabled={!classeId || !classe?.effectif}
            loading={parClasse.isPending}
            onClick={() => parClasse.mutate()}
          >
            Générer le PDF
          </Button>
        </Group>
        <Switch
          mt="sm"
          label="Afficher toutes les classes (pas seulement la maternelle)"
          checked={toutesClasses}
          onChange={(e) => {
            const v = e.currentTarget.checked;
            setToutesClasses(v);
            if (!v && classe && !classe.maternelle) setClasseId(null);
          }}
        />
        {classe && (
          <Text size="sm" c="dimmed" mt="xs">
            {classe.effectif} carte{classe.effectif > 1 ? 's' : ''} · {Math.ceil(classe.effectif / 8)} page{Math.ceil(classe.effectif / 8) > 1 ? 's' : ''} A4
          </Text>
        )}
      </Paper>

      <Paper withBorder p="md">
        <Title order={5} mb="sm">
          Pour des élèves choisis
        </Title>
        <Group gap="sm" align="flex-end">
          <MultiSelect
            label="Élèves"
            placeholder="Rechercher un élève"
            data={(eleves ?? []).map((e) => ({ value: e.id, label: `${e.prenom} ${e.nom}${e.matricule ? ` (${e.matricule})` : ''}` }))}
            value={eleveIds}
            onChange={setEleveIds}
            searchable
            clearable
            w={{ base: '100%', sm: 420 }}
          />
          <Button
            leftSection={<IconId size={16} stroke={1.5} />}
            disabled={eleveIds.length === 0}
            loading={parEleves.isPending}
            onClick={() => parEleves.mutate()}
          >
            Générer le PDF
          </Button>
        </Group>
      </Paper>
    </Stack>
  );
}
