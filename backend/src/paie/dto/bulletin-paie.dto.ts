import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class LigneBulletinDto {
  @IsString()
  libelle: string;

  @IsOptional()
  @IsBoolean()
  imposable?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantGain?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantRetenue?: number;
}

export class HeureClasseDto {
  @IsString()
  classeId: string;

  @IsString()
  matiereId: string;

  @IsInt()
  @Min(0)
  heures: number;
}

export class CreateBulletinPaieDto {
  @IsString()
  personnelId: string;

  @IsInt()
  @Min(1)
  @Max(12)
  mois: number;

  @IsInt()
  @Min(2000)
  annee: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  nombreHeures?: number;

  @IsOptional()
  @IsString()
  modePaiement?: string;

  // Enseignant : heures dispensées ce mois pour chaque classe/affectation.
  // La base = Σ (heures × taux horaire de l'affectation).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => HeureClasseDto)
  heuresParClasse?: HeureClasseDto[];

  // Lignes additionnelles (indemnités, retenues...). La base salariale est
  // ajoutée automatiquement par le serveur (fixe pour l'administratif, calculée
  // heures × taux pour l'enseignant).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneBulletinDto)
  lignes?: LigneBulletinDto[];
}
