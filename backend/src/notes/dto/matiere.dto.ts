import { IsNumber, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateMatiereDto {
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
