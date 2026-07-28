import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ModePaiement } from '../../generated/prisma/enums';

export class CreatePaiementDto {
  @IsString()
  factureId: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  @IsOptional()
  @IsEnum(ModePaiement)
  mode?: ModePaiement;

  @IsOptional()
  @IsString()
  reference?: string;
}
