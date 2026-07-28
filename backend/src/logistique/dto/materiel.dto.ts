import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { CategorieMateriel, EtatMateriel } from '../../generated/prisma/enums';

export class CreateMaterielDto {
  @IsEnum(CategorieMateriel)
  categorie: CategorieMateriel;

  @IsString()
  designation: string;

  @IsInt()
  @Min(1)
  quantite: number;

  @IsOptional()
  @IsEnum(EtatMateriel)
  etat?: EtatMateriel;

  @IsOptional()
  @IsString()
  salleId?: string;

  @IsOptional()
  @IsString()
  description?: string;
}

export class UpdateMaterielDto {
  @IsOptional()
  @IsEnum(CategorieMateriel)
  categorie?: CategorieMateriel;

  @IsOptional()
  @IsString()
  designation?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantite?: number;

  @IsOptional()
  @IsEnum(EtatMateriel)
  etat?: EtatMateriel;

  @IsOptional()
  @IsString()
  salleId?: string | null;

  @IsOptional()
  @IsString()
  description?: string;
}
