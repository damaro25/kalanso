import { IsEnum, IsNumber, IsPositive, IsString, Matches } from 'class-validator';
import { OperateurMobileMoney } from '../../generated/prisma/enums';

export class InitierTransactionDto {
  @IsString()
  factureId: string;

  @IsEnum(OperateurMobileMoney)
  operateur: OperateurMobileMoney;

  @Matches(/^\d{6,15}$/, { message: 'Le numéro de téléphone doit contenir entre 6 et 15 chiffres' })
  telephone: string;

  @IsNumber()
  @IsPositive()
  montant: number;
}
