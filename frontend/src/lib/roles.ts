export type Role = 'FONDATEUR' | 'CHEF_ETABLISSEMENT' | 'SECRETAIRE' | 'COMPTABLE' | 'ENSEIGNANT';

export const ROLE_LABELS: Record<Role, string> = {
  FONDATEUR: 'Fondateur',
  CHEF_ETABLISSEMENT: "Chef d'établissement",
  SECRETAIRE: 'Secrétaire',
  COMPTABLE: 'Comptable',
  ENSEIGNANT: 'Enseignant',
};
