import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateFraisInscriptionNiveauDto {
  @IsString()
  niveauId: string;

  @IsString()
  anneeScolaireId: string;

  @IsNumber()
  @IsPositive()
  montant: number;
}

export class UpdateFraisInscriptionNiveauDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  montant?: number;

  @IsOptional()
  @IsString()
  anneeScolaireId?: string;
}
