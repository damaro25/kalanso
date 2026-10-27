import { IsDateString, IsEnum, IsNumber, IsOptional, IsPositive, IsString, ValidateIf } from 'class-validator';
import { Regime } from '../../generated/prisma/enums';

export class CreateTarifEcolageDto {
  @IsString()
  niveauId: string;

  @IsString()
  anneeScolaireId: string;

  @IsString()
  libelle: string;

  @IsNumber()
  @IsPositive()
  montant: number;

  // Absent : le tarif s'applique à tous les régimes du niveau.
  @IsOptional()
  @IsEnum(Regime)
  regime?: Regime;

  @IsOptional()
  @IsDateString()
  dateEcheance?: string;
}

export class UpdateTarifEcolageDto {
  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  montant?: number;

  @IsOptional()
  @IsString()
  anneeScolaireId?: string;

  // null : le tarif s'applique désormais à tous les régimes du niveau.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsEnum(Regime)
  regime?: Regime | null;

  // null : retire l'échéance.
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsDateString()
  dateEcheance?: string | null;
}
