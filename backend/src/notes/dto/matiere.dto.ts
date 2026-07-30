import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateMatiereDto {
  // Optionnel : permet à un client hors-ligne de générer l'id à l'avance et de
  // rejouer la requête sans risque de doublon (voir matieres.service.ts).
  @IsOptional()
  @IsString()
  id?: string;

  @IsString()
  niveauId: string;

  @IsString()
  nom: string;

  @IsNumber()
  @IsPositive()
  coefficient: number;
}

export class UpdateMatiereDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  coefficient?: number;
}
