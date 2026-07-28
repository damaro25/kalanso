import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateLivreDto {
  @IsString()
  titre: string;

  @IsOptional()
  @IsString()
  auteur?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  categorie?: string;

  @IsInt()
  @Min(1)
  quantiteTotale: number;
}

export class UpdateLivreDto {
  @IsOptional()
  @IsString()
  titre?: string;

  @IsOptional()
  @IsString()
  auteur?: string;

  @IsOptional()
  @IsString()
  isbn?: string;

  @IsOptional()
  @IsString()
  categorie?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantiteTotale?: number;
}
