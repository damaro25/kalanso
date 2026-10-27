import { ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

export class AnnulerPaiementsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  paiementIds: string[];

  @IsString()
  @MaxLength(500)
  motif: string;
}
