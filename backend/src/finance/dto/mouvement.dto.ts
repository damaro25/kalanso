import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { TypeMouvement } from '../../generated/prisma/enums';

export class CreateMouvementDto {
  @IsEnum(TypeMouvement)
  type: TypeMouvement;

  @IsString()
  categorie: string;

  @IsString()
  libelle: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsOptional()
  @IsDateString()
  date?: string;

  @IsOptional()
  @IsString()
  modePaiement?: string;
}
