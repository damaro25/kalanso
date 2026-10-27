import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

// Options de la clôture d'année (aperçu et exécution) ; toutes facultatives, voir ClotureService.defauts.
export class ApercuClotureDto {
  @IsOptional()
  @IsString()
  anneeId?: string;

  @IsOptional()
  @IsString()
  suivanteId?: string;

  @IsOptional()
  @IsString()
  suivanteLibelle?: string;

  @IsOptional()
  @IsDateString()
  suivanteDebut?: string;

  @IsOptional()
  @IsDateString()
  suivanteFin?: string;

  @IsOptional()
  @IsBoolean()
  copierClasses?: boolean;

  @IsOptional()
  @IsIn(['IDENTIQUES', 'AJUSTES', 'AUCUN'])
  tarifs?: 'IDENTIQUES' | 'AJUSTES' | 'AUCUN';

  @IsOptional()
  @IsNumber()
  @Min(-50)
  @Max(100)
  ajustementPct?: number;

  @IsOptional()
  @IsBoolean()
  decalerEcheances?: boolean;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  fraisReinscription?: number | null;

  @IsOptional()
  @IsBoolean()
  reinscrire?: boolean;

  @IsOptional()
  @IsBoolean()
  genererFactures?: boolean;

  @IsOptional()
  @IsBoolean()
  rendreCourante?: boolean;
}

export class ExecuterClotureDto extends ApercuClotureDto {
  // Code de sécurité (le même que pour les dépenses et le budget)
  @IsOptional()
  @IsString()
  code?: string;

  // Continuer si la sauvegarde automatique (pg_dump) est impossible
  @IsOptional()
  @IsBoolean()
  sansSauvegarde?: boolean;
}
