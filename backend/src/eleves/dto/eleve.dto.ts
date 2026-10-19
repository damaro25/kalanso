import { IsDateString, IsEnum, IsOptional, IsString, ValidateIf } from 'class-validator';
import { Genre } from '../../generated/prisma/enums';

export class UpdateEleveDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsEnum(Genre)
  genre?: Genre;

  @IsOptional()
  @IsString()
  matricule?: string;

  // Chaîne vide : date effacée
  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  adresse?: string;
}
