// Postes de décaissement du budget de trésorerie de l'école (Loyer, Fournitures,
// Nourriture, Remboursement crédit, Eau et électricité, Nettoyage et gardien),
// complétés par les autres dépenses courantes. Les salaires n'y figurent pas :
// ils viennent des bulletins de paie (module Paie).
export const POSTES_DEPENSE = [
  'Loyer',
  'Fournitures',
  'Nourriture',
  'Remboursement crédit',
  'Eau et électricité',
  'Nettoyage et gardien',
  'Équipement',
  'Maintenance',
  'Transport',
  'Impôts & taxes',
  'Autre',
];

export const MODES_PAIEMENT_DEPENSE = ['Espèces', 'Virement', 'Chèque', 'Mobile money', 'Autre'];
