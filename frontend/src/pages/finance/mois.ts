import type { TresorerieMensuelle } from '../../api/finance';

type ColonneMois = TresorerieMensuelle['mois'][number];

// En-tête de colonne du tableau : « Oct 26 », ou « Avant octobre » / « Après juin »
// pour les opérations datées hors de la période octobre-juin.
export function enteteMois(m: ColonneMois) {
  return m.hors ? m.libelle : `${m.libelle.slice(0, 3)} ${String(m.annee).slice(2)}`;
}

// Étiquette courte pour l'axe d'un graphique.
export function libelleCourt(m: ColonneMois) {
  return m.hors ? (m.hors === 'AVANT' ? 'Avant' : 'Après') : m.libelle.slice(0, 3);
}
