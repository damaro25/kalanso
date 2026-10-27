import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Table, Title, Button, Group, Badge, Anchor, TextInput, Text, Select, ActionIcon, Tooltip } from '@mantine/core';
import { IconSearch, IconDownload, IconUpload, IconTrash, IconPencil } from '@tabler/icons-react';
import { fetchEleves, type Eleve } from '../../api/eleves';
import { fetchClassesCourantes } from '../../api/classes';
import { REGIMES, libelleRegime, type Regime } from '../../api/finances';
import { telechargerExportEleves } from '../../api/reporting';
import { telechargerExportElevesComplet } from '../../api/elevesImport';
import { ImportElevesModal } from './ImportElevesModal';
import { SuppressionEleveModal } from './SuppressionEleveModal';
import { ModifierEleveModal } from './ModifierEleveModal';
import { correspond } from '../../lib/search';
import { useAuth } from '../../auth/AuthContext';

export function ElevesListPage() {
  const { user } = useAuth();
  // « Nouvel élève » ouvre l'inscription sur place (inscription directe en classe) : réservé à ceux qui traitent les admissions.
  const peutAdmettre = user?.role === 'FONDATEUR' || user?.role === 'CHEF_ETABLISSEMENT' || user?.role === 'SECRETAIRE';
  const [recherche, setRecherche] = useState('');
  const [classeId, setClasseId] = useState<string | null>(null);
  const [regime, setRegime] = useState<Regime | null>(null);
  const [importOuvert, setImportOuvert] = useState(false);
  const [eleveASupprimer, setEleveASupprimer] = useState<Eleve | null>(null);
  const [eleveAModifier, setEleveAModifier] = useState<Eleve | null>(null);

  const { data: classes } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes });
  const { data: eleves, isLoading } = useQuery({
    queryKey: ['eleves', 'liste', classeId, regime],
    queryFn: () => fetchEleves({ classeId: classeId ?? undefined, regime: regime ?? undefined }),
  });

  const elevesFiltres = useMemo(
    () =>
      (eleves ?? [])
        .filter((e) => correspond([e.nom, e.prenom, e.matricule, e.classe?.nom], recherche))
        .sort((a, b) => a.nom.localeCompare(b.nom)),
    [eleves, recherche],
  );

  return (
    <>
      <Group justify="space-between" mb="md">
        <Title order={2}>Élèves</Title>
        <Group>
          <Button
            variant="light"
            leftSection={<IconDownload size={16} stroke={1.5} />}
            onClick={() =>
              // Gestion : liste complète (contacts, filiation), réimportable. Enseignant : liste simple de ses classes.
              peutAdmettre
                ? telechargerExportElevesComplet({ classeId: classeId ?? undefined, regime: regime ?? undefined })
                : telechargerExportEleves(classeId ?? undefined, regime ?? undefined)
            }
          >
            Exporter (Excel)
          </Button>
          {peutAdmettre && (
            <Button variant="light" leftSection={<IconUpload size={16} stroke={1.5} />} onClick={() => setImportOuvert(true)}>
              Importer (Excel)
            </Button>
          )}
          {peutAdmettre && (
            <Button component={Link} to="/eleves/nouveau">
              Nouvel élève
            </Button>
          )}
        </Group>
      </Group>

      <ImportElevesModal opened={importOuvert} onClose={() => setImportOuvert(false)} />
      <SuppressionEleveModal eleve={eleveASupprimer} onClose={() => setEleveASupprimer(null)} />
      <ModifierEleveModal eleve={eleveAModifier} onClose={() => setEleveAModifier(null)} />

      <Group mb="md">
        <TextInput
          placeholder="Rechercher un élève par nom, matricule ou classe..."
          leftSection={<IconSearch size={16} stroke={1.5} />}
          value={recherche}
          onChange={(e) => setRecherche(e.currentTarget.value)}
          maw={420}
        />
        <Select
          placeholder="Toutes les classes"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          clearable
          w={{ base: '100%', sm: 260 }}
        />
        <Select
          placeholder="Tous les régimes"
          data={REGIMES}
          value={regime}
          onChange={(v) => setRegime(v as Regime | null)}
          clearable
          w={{ base: '100%', sm: 200 }}
        />
      </Group>

      {isLoading && <p>Chargement...</p>}

      {eleves && eleves.length === 0 && (
        <Text c="dimmed">
          {regime
            ? `Aucun élève en ${libelleRegime(regime).toLowerCase()}${classeId ? ' dans cette classe' : ''}.`
            : classeId
              ? 'Aucun élève inscrit dans cette classe.'
              : 'Aucun élève enregistré.'}
        </Text>
      )}

      {eleves && eleves.length > 0 && elevesFiltres.length === 0 && (
        <Text c="dimmed">Aucun élève ne correspond à « {recherche} ».</Text>
      )}

      {eleves && elevesFiltres.length > 0 && (
        <Table.ScrollContainer minWidth={720}>
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Matricule</Table.Th>
                <Table.Th>Nom</Table.Th>
                <Table.Th>Prénom</Table.Th>
                <Table.Th>Genre</Table.Th>
                <Table.Th>Classe</Table.Th>
                <Table.Th>Régime</Table.Th>
                <Table.Th />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {elevesFiltres.map((eleve) => (
                <Table.Tr key={eleve.id}>
                  <Table.Td>{eleve.matricule ?? '—'}</Table.Td>
                  <Table.Td>{eleve.nom}</Table.Td>
                  <Table.Td>{eleve.prenom}</Table.Td>
                  <Table.Td>
                    <Badge color={eleve.genre === 'F' ? 'pink' : 'blue'}>{eleve.genre}</Badge>
                  </Table.Td>
                  <Table.Td>
                    {eleve.classe ? (
                      <>
                        {eleve.classe.nom}
                        <Text size="xs" c="dimmed">
                          {eleve.classe.niveau}
                        </Text>
                      </>
                    ) : (
                      <Text size="sm" c="dimmed">
                        Non inscrit
                      </Text>
                    )}
                  </Table.Td>
                  <Table.Td>{eleve.regime ? libelleRegime(eleve.regime) : '—'}</Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap" justify="flex-end">
                      <Anchor component={Link} to={`/eleves/${eleve.id}`}>
                        Voir la fiche
                      </Anchor>
                      {peutAdmettre && (
                        <Button size="xs" variant="light" leftSection={<IconPencil size={14} stroke={1.5} />} onClick={() => setEleveAModifier(eleve)}>
                          Modifier
                        </Button>
                      )}
                      {peutAdmettre && (
                        <Tooltip label="Supprimer l'élève">
                          <ActionIcon
                            variant="subtle"
                            color="red"
                            onClick={() => setEleveASupprimer(eleve)}
                            aria-label={`Supprimer ${eleve.prenom} ${eleve.nom}`}
                          >
                            <IconTrash size={16} stroke={1.5} />
                          </ActionIcon>
                        </Tooltip>
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
  );
}
