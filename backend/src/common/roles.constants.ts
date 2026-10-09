import { RoleUtilisateur } from '../generated/prisma/enums';

// Tout le personnel de gestion : l'enseignant en est exclu, il n'a accès qu'à ses classes (voir PerimetreService).
export const ROLES_SANS_ENSEIGNANT: RoleUtilisateur[] = [
  RoleUtilisateur.FONDATEUR,
  RoleUtilisateur.CHEF_ETABLISSEMENT,
  RoleUtilisateur.SECRETAIRE,
  RoleUtilisateur.COMPTABLE,
];

export const ROLES_DIRECTION: RoleUtilisateur[] = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];
