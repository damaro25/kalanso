import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconDownload } from '@tabler/icons-react';
import { fetchClassesCourantes } from '../../api/classes';
import { telechargerImpayesParTranche } from '../../api/reporting';

// Téléchargement des impayés d'écolage par tranche et par classe : toutes les classes ou une seule, toutes les
// tranches ou une seule. Formulaire utilisé dans la fenêtre du tableau de bord et dans la page du menu Finances.
export function FormulaireImpayesTranche({ onTelecharge }: { onTelecharge?: () => void }) {
  const { data: classes } = useQuery({ queryKey: ['classes', 'courante'], queryFn: fetchClassesCourantes });
  const [classeId, setClasseId] = useState<string | null>(null);
  const [tranche, setTranche] = useState<string | null>(null);
  const [enCours, setEnCours] = useState(false);

  async function telecharger() {
    setEnCours(true);
    try {
      await telechargerImpayesParTranche({ classeId: classeId ?? undefined, tranche: tranche ?? undefined });
      onTelecharge?.();
    } catch {
      notifications.show({ message: 'Erreur lors du téléchargement', color: 'red' });
    } finally {
      setEnCours(false);
    }
  }

  return (
      <Stack>
        <Text size="sm" c="dimmed">
          Fichier Excel : une feuille par classe, le reste à payer de chaque élève sur chaque tranche d'écolage.
        </Text>
        <Select
          label="Classe"
          placeholder="Toutes les classes"
          data={(classes ?? []).map((c) => ({ value: c.id, label: `${c.nom} (${c.niveau.nom})` }))}
          value={classeId}
          onChange={setClasseId}
          searchable
          clearable
        />
        <Select
          label="Tranche"
          placeholder="Toutes les tranches"
          data={[
            { value: '1', label: 'Tranche 1' },
            { value: '2', label: 'Tranche 2' },
            { value: '3', label: 'Tranche 3' },
          ]}
          value={tranche}
          onChange={setTranche}
          clearable
        />
        <Group justify="flex-end">
          <Button leftSection={<IconDownload size={16} stroke={1.5} />} loading={enCours} onClick={telecharger}>
            Télécharger
          </Button>
        </Group>
      </Stack>
  );
}

export function ImpayesTrancheModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  return (
    <Modal opened={opened} onClose={onClose} title="Impayés par tranche et par classe">
      {opened && <FormulaireImpayesTranche onTelecharge={onClose} />}
    </Modal>
  );
}
