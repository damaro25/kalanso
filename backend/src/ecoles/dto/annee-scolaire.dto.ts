import { IsBoolean, IsDateString, IsOptional, IsString } from 'class-validator';

export class CreateAnneeScolaireDto {
  @IsString()
  libelle: string;

  @IsDateString()
  dateDebut: string;

  @IsDateString()
  dateFin: string;
}

export class UpdateAnneeScolaireDto {
  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;

  @IsOptional()
  @IsBoolean()
  courante?: boolean;
}
