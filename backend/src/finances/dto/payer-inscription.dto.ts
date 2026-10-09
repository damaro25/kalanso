import { IsEnum, IsIn, IsOptional } from 'class-validator';
import { ModePaiement } from '../../generated/prisma/enums';

// Le montant n'est pas saisi : c'est celui des frais d'inscription / réinscription du niveau.
export class PayerInscriptionDto {
  @IsOptional()
  @IsEnum(ModePaiement)
  mode?: ModePaiement;

  // Type d'opération choisi par le caissier ; à défaut, celui détecté (ou celui de la facture déjà payée en partie).
  @IsOptional()
  @IsIn(['INSCRIPTION', 'REINSCRIPTION'])
  type?: 'INSCRIPTION' | 'REINSCRIPTION';
}
