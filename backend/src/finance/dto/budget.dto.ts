import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Min } from 'class-validator';

// Montants prévus : octobre à juin, puis les vacances (10 colonnes).
export class AjouterPosteBudgetDto {
  @IsOptional()
  @IsString()
  anneeScolaireId?: string;

  @IsString()
  poste: string;

  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  montants: number[];
}

export class ModifierPosteBudgetDto {
  @IsOptional()
  @IsString()
  poste?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(10)
  @ArrayMaxSize(10)
  @IsNumber({}, { each: true })
  @Min(0, { each: true })
  montants?: number[];
}
