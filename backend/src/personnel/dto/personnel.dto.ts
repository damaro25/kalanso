import { IsDateString, IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Genre, TypePersonnel } from '../../generated/prisma/enums';

export class CreatePersonnelDto {
  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsString()
  fonction: string;

  @IsOptional()
  @IsEnum(TypePersonnel)
  type?: TypePersonnel;

  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  @IsOptional()
  @IsString()
  matricule?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsDateString()
  dateEmbauche?: string;

  // Salaire de base mensuel (personnel administratif). Pour un enseignant, le
  // salaire est calculé à partir des heures × taux de ses affectations.
  @IsOptional()
  @IsNumber()
  @Min(0)
  salaireBase?: number;
}

export class UpdatePersonnelDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsString()
  fonction?: string;

  @IsOptional()
  @IsEnum(TypePersonnel)
  type?: TypePersonnel;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  salaireBase?: number;
}
