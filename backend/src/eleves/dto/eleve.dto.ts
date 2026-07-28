import { IsDateString, IsEnum, IsOptional, IsString } from 'class-validator';
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

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  adresse?: string;
}
