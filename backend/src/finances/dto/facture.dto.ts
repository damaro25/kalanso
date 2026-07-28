import { IsDateString, IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateFactureDto {
  @IsString()
  eleveId: string;

  @IsString()
  libelle: string;

  @IsNumber()
  @IsPositive()
  montantTotal: number;

  @IsOptional()
  @IsString()
  anneeScolaireId?: string;

  @IsOptional()
  @IsDateString()
  dateEcheance?: string;
}
