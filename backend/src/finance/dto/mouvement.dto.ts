import { IsEnum, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { TypeMouvement } from '../../generated/prisma/enums';

export class CreateMouvementDto {
  @IsEnum(TypeMouvement)
  type: TypeMouvement;

  @IsString()
  categorie: string;

  @IsString()
  libelle: string;

  @IsNumber()
  @Min(0)
  montant: number;

  @IsOptional()
  @IsString()
  date?: string;

  @IsOptional()
  @IsString()
  modePaiement?: string;
}
