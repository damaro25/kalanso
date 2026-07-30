import { useState } from 'react';
import { Alert, Group, Text, Popover, Stack, Button, ActionIcon } from '@mantine/core';
import { IconWifiOff, IconAlertTriangle, IconX, IconRefresh } from '@tabler/icons-react';
import { useConnectivity } from './useConnectivity';
import { useFailedEntries, retryFailed, discardFailed } from './outbox';
import { flushOutbox } from './sync';
import { getQueryClient } from './queryClientRef';

export function SyncStatusBanner() {
  const { isOnline, pendingCount, failedCount } = useConnectivity();
  const failedEntries = useFailedEntries();
  const [opened, setOpened] = useState(false);

  if (isOnline && pendingCount === 0 && failedCount === 0) {
    return null;
  }

  const color = !isOnline ? 'accent' : failedCount > 0 ? 'red' : 'kalanso';
  const label = !isOnline
    ? `Hors ligne${pendingCount > 0 ? ` — ${pendingCount} action(s) en attente` : ''}`
    : pendingCount > 0
      ? `Synchronisation en cours — ${pendingCount} action(s) restante(s)`
      : `${failedCount} erreur(s) de synchronisation`;

  async function relancer(id: string) {
    await retryFailed(id);
    await flushOutbox(getQueryClient());
  }

  return (
    <Alert color={color} icon={!isOnline ? <IconWifiOff size={18} /> : <IconAlertTriangle size={18} />} mb="md" py={6}>
      <Group justify="space-between" wrap="nowrap">
        <Text size="sm" fw={500}>
          {label}
        </Text>
        {failedCount > 0 && (
          <Popover opened={opened} onChange={setOpened} width={360} position="bottom-end" withArrow>
            <Popover.Target>
              <Button size="xs" variant="white" onClick={() => setOpened((o) => !o)}>
                Voir les erreurs
              </Button>
            </Popover.Target>
            <Popover.Dropdown>
              <Stack gap="xs">
                {failedEntries.map((entry) => (
                  <Group key={entry.id} justify="space-between" wrap="nowrap" align="flex-start">
                    <Stack gap={2} style={{ flex: 1 }}>
                      <Text size="xs" fw={600}>
                        {entry.entityType}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {entry.lastError}
                      </Text>
                    </Stack>
                    <Group gap={4} wrap="nowrap">
                      <ActionIcon size="sm" variant="light" onClick={() => relancer(entry.id)} title="Réessayer">
                        <IconRefresh size={14} />
                      </ActionIcon>
                      <ActionIcon size="sm" variant="light" color="red" onClick={() => discardFailed(entry.id)} title="Abandonner">
                        <IconX size={14} />
                      </ActionIcon>
                    </Group>
                  </Group>
                ))}
              </Stack>
            </Popover.Dropdown>
          </Popover>
        )}
      </Group>
    </Alert>
  );
}
