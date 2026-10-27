import type { Regime } from '../generated/prisma/enums';

// La grille tarifaire de l'écran de configuration : pour chaque niveau et chaque régime, trois tranches
// d'écolage. Chaque tranche est un TarifEcolage ordinaire, reconnu à son libellé « <Régime> - Tranche n ».

export const NB_TRANCHES = 3;

export type GrilleRegime = Regime | 'TOUS';

export const GRILLE_REGIMES: GrilleRegime[] = ['TOUS', 'EXTERNAT', 'SEMI_INTERNAT', 'INTERNAT', 'PENSIONNAT'];

// Montant de chaque tranche ; null : pas de tranche (aucun tarif).
export type Tranches = [number | null, number | null, number | null];

const PREFIXES: Record<GrilleRegime, string> = {
  TOUS: 'Écolage',
  EXTERNAT: 'Externat',
  SEMI_INTERNAT: 'Semi-internat',
  INTERNAT: 'Internat',
  PENSIONNAT: 'Pensionnat',
};

export function libelleTranche(regime: GrilleRegime, numero: number): string {
  return `${PREFIXES[regime]} - Tranche ${numero}`;
}

export function regimeTarif(regime: GrilleRegime): Regime | null {
  return regime === 'TOUS' ? null : regime;
}

// Retrouve régime et numéro de tranche d'un tarif créé par la grille ; null pour un tarif saisi à la main.
export function lireTranche(tarif: { libelle: string; regime: Regime | null }): { regime: GrilleRegime; numero: number } | null {
  const regime: GrilleRegime = tarif.regime ?? 'TOUS';
  const match = tarif.libelle.match(/^(.*) - Tranche (\d)$/);
  if (!match || match[1] !== PREFIXES[regime]) return null;
  const numero = Number(match[2]);
  return numero >= 1 && numero <= NB_TRANCHES ? { regime, numero } : null;
}
