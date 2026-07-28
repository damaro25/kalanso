import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateClasseDto {
  @IsString()
  nom: string;

  @IsString()
  niveauId: string;

  @IsString()
  anneeScolaireId: string;

  @IsOptional()
  @IsInt()
  capaciteMax?: number;
}

export class UpdateClasseDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsInt()
  capaciteMax?: number;
}
