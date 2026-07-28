import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

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
}
