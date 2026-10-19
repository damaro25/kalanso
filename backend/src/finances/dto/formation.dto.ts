import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Matches, Min, MinLength } from 'class-validator';
import { Regime } from '../../generated/prisma/enums';

export class FormationDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tarifMensuel?: number;

  // Régimes pour lesquels la formation est gratuite
  @IsOptional()
  @IsArray()
  @IsEnum(Regime, { each: true })
  regimesGratuits?: Regime[];

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class ModifierFormationDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tarifMensuel?: number;

  @IsOptional()
  @IsArray()
  @IsEnum(Regime, { each: true })
  regimesGratuits?: Regime[];

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}

export class InscrireFormationDto {
  @IsString()
  formationId: string;
}

export class FacturerFormationsDto {
  // Mois facturé, AAAA-MM
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'Mois invalide : le format attendu est AAAA-MM' })
  mois: string;

  @IsOptional()
  @IsString()
  eleveId?: string;
}
