import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { RoleUtilisateur } from '../../generated/prisma/enums';

export class CreateUtilisateurDto {
  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(RoleUtilisateur)
  role: RoleUtilisateur;

  @IsOptional()
  @IsString()
  personnelId?: string;
}

export class UpdateUtilisateurDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsEnum(RoleUtilisateur)
  role?: RoleUtilisateur;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  // Fournir un nouveau mot de passe seulement pour le réinitialiser.
  @IsOptional()
  @IsString()
  @MinLength(6)
  password?: string;
}
