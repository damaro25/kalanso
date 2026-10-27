import type { GrilleRegime, Tranches } from './grille';

// Fiche de renseignements 2025-2026 des Écoles Mamé-TA (version avec horaires et maillot de sport).
// Sert au bouton « Charger la fiche Mamé-TA » de l'écran de configuration et au script
// prisma/scripts/configurer-mame-ta.ts.

export const ECOLE_MAME_TA = {
  nom: 'Les Écoles Mamé-TA',
  sigle: 'Mamé-TA',
  telephone: '+224 622 14 91 07 / 655 54 07 03 / 628 04 66 12',
  email: 'mametahold016@gmail.com',
};

export const ANNEE_MAME_TA = {
  libelle: '2025-2026',
  // « Tous les jours du 01 Oct. au 31 Juin » (régime pensionnat) : le 31 juin n'existant pas, fin au 30 juin.
  dateDebut: '2025-10-01',
  dateFin: '2026-06-30',
};

export const FRAIS_INSCRIPTION_MAME_TA = 100_000;
export const FRAIS_REINSCRIPTION_MAME_TA = 50_000;

// Tranche 1 à l'inscription, tranche 2 au 6 janvier, tranche 3 au 10 avril. La tranche 2 du pensionnat
// est « en janvier » sans jour : alignée sur le 6 janvier.
export const ECHEANCES_MAME_TA: [string | null, string | null, string | null] = [null, '2026-01-06', '2026-04-10'];

// L'ordre doit se suivre (+1) : le passage en classe supérieure cherche le niveau d'ordre suivant.
export const NIVEAUX_MAME_TA = [
  { nom: 'Crèche / Garderie', cycle: 'Maternelle', ordre: 1 },
  { nom: 'PS', cycle: 'Maternelle', ordre: 2 },
  { nom: 'MS', cycle: 'Maternelle', ordre: 3 },
  { nom: 'GS', cycle: 'Maternelle', ordre: 4 },
  { nom: '1ère année', cycle: 'Primaire', ordre: 5 },
  { nom: '2ème année', cycle: 'Primaire', ordre: 6 },
  { nom: '3ème année', cycle: 'Primaire', ordre: 7 },
  { nom: '4ème année', cycle: 'Primaire', ordre: 8 },
  { nom: '5ème année', cycle: 'Primaire', ordre: 9 },
  { nom: '6ème année', cycle: 'Primaire', ordre: 10 },
];

const MATERNELLE = ['PS', 'MS', 'GS'];
const PRIMAIRE = ['1ère année', '2ème année', '3ème année', '4ème année', '5ème année', '6ème année'];

// Montants en GNF, par groupe de niveaux et régime (TOUS : tarif commun à tous les régimes).
const GRILLES: { niveaux: string[]; regime: GrilleRegime; tranches: Tranches }[] = [
  { niveaux: ['Crèche / Garderie'], regime: 'TOUS', tranches: [2_500_000, 500_000, 500_000] },
  { niveaux: MATERNELLE, regime: 'EXTERNAT', tranches: [500_000, 400_000, 200_000] },
  { niveaux: MATERNELLE, regime: 'SEMI_INTERNAT', tranches: [2_500_000, 1_000_000, 500_000] },
  { niveaux: MATERNELLE, regime: 'INTERNAT', tranches: [2_500_000, 2_000_000, 500_000] },
  { niveaux: ['1ère année', '2ème année'], regime: 'EXTERNAT', tranches: [500_000, 500_000, 200_000] },
  { niveaux: ['3ème année', '4ème année'], regime: 'EXTERNAT', tranches: [600_000, 400_000, 300_000] },
  { niveaux: ['5ème année', '6ème année'], regime: 'EXTERNAT', tranches: [700_000, 500_000, 300_000] },
  { niveaux: PRIMAIRE, regime: 'SEMI_INTERNAT', tranches: [3_000_000, 1_500_000, 500_000] },
  { niveaux: PRIMAIRE, regime: 'INTERNAT', tranches: [3_500_000, 2_500_000, 500_000] },
  // Pensionnat (maternelle et primaire) : 9 750 000 GNF en deux tranches.
  { niveaux: [...MATERNELLE, ...PRIMAIRE], regime: 'PENSIONNAT', tranches: [6_500_000, 3_250_000, null] },
];

// Tranches par niveau puis par régime, au format de la grille de l'écran de configuration.
export function tarifsMameTa(): Map<string, Partial<Record<GrilleRegime, Tranches>>> {
  const parNiveau = new Map<string, Partial<Record<GrilleRegime, Tranches>>>();
  for (const grille of GRILLES) {
    for (const niveau of grille.niveaux) {
      const tarifs = parNiveau.get(niveau) ?? {};
      tarifs[grille.regime] = grille.tranches;
      parNiveau.set(niveau, tarifs);
    }
  }
  return parNiveau;
}
