import { Group, Paper, Text } from '@mantine/core';

const JOUR = 24 * 60 * 60 * 1000;

export type EtatTranche = 'RETARD' | 'PROCHE' | 'OK';

// Rouge : échéance dépassée avec un reste à payer. Jaune : reste à payer et échéance dans moins d'un mois. Vert sinon.
export function etatTranche(reste: number, dateEcheance: string | null, maintenant = new Date()): EtatTranche {
  if (reste <= 0 || !dateEcheance) return 'OK';
  const echeance = new Date(dateEcheance);
  echeance.setHours(23, 59, 59, 999); // le jour de l'échéance compte encore comme à temps
  const ecart = echeance.getTime() - maintenant.getTime();
  if (ecart < 0) return 'RETARD';
  if (ecart < 30 * JOUR) return 'PROCHE';
  return 'OK';
}

const COULEURS: Record<EtatTranche, string> = { RETARD: 'red', PROCHE: 'yellow', OK: 'green' };
const TEXTE: Record<EtatTranche, string> = { RETARD: 'red.7', PROCHE: 'yellow.8', OK: 'green.7' };

// Les tranches d'écolage de l'année de l'inscription en cours, avec reste à payer et échéance.
export function TranchesEcolage({ factures, anneeScolaireId }: { factures: any[]; anneeScolaireId?: string }) {
  const tranches = factures
    .filter((f) => f.type === 'ECOLAGE' && f.statut !== 'ANNULEE' && (!anneeScolaireId || f.anneeScolaireId === anneeScolaireId))
    .sort(
      (a, b) =>
        (a.dateEcheance ? new Date(a.dateEcheance).getTime() : Infinity) -
          (b.dateEcheance ? new Date(b.dateEcheance).getTime() : Infinity) ||
        String(a.libelle).localeCompare(String(b.libelle), 'fr', { numeric: true }),
    );

  if (tranches.length === 0) {
    return (
      <Paper withBorder p="md">
        <Text size="sm" c="dimmed">
          Tranches d'écolage
        </Text>
        <Text fw={700}>Aucune tranche facturée</Text>
      </Paper>
    );
  }

  return (
    <>
      {tranches.map((f) => {
        const reste = Math.max(0, Number(f.montantTotal) - Number(f.montantPaye));
        const etat = etatTranche(reste, f.dateEcheance);
        const libelle = String(f.libelle).replace(/^.* - (Tranche .*)$/i, '$1');
        return (
          <Paper
            key={f.id}
            withBorder
            p="md"
            bg={`${COULEURS[etat]}.0`}
            style={{ borderLeft: `4px solid var(--mantine-color-${COULEURS[etat]}-6)` }}
          >
            <Text size="sm" c="dimmed">
              {libelle}
            </Text>
            <Text fw={700} c={TEXTE[etat]}>
              {reste > 0 ? `Reste ${reste.toLocaleString('fr-FR')} GNF` : 'Soldée'}
            </Text>
            <Group gap={4}>
              <Text size="sm" c={etat === 'OK' ? 'dimmed' : TEXTE[etat]}>
                {f.dateEcheance
                  ? `Échéance : ${new Date(f.dateEcheance).toLocaleDateString('fr-FR')}`
                  : "Pas d'échéance fixée"}
                {etat === 'RETARD' ? ' (dépassée)' : ''}
              </Text>
            </Group>
          </Paper>
        );
      })}
    </>
  );
}
