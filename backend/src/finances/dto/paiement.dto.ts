import { IsEnum, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';
import { ModePaiement } from '../../generated/prisma/enums';

export class CreatePaiementDto {
  // Optionnel : permet à un client hors-ligne de générer l'id à l'avance et de
  // rejouer la requête sans risque de doublon si la réponse d'un premier envoi
  // s'est perdue en route (voir paiements.service.ts).
  @IsOptional()
  @IsString()
  id?: string;

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
