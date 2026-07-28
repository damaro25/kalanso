import { SetMetadata } from '@nestjs/common';
import { RoleUtilisateur } from '../../generated/prisma/enums';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: RoleUtilisateur[]) => SetMetadata(ROLES_KEY, roles);
