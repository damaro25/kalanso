import { IsOptional, IsString } from 'class-validator';

export class CreateEmpruntDto {
  @IsString()
  livreId: string;

  @IsString()
  eleveId: string;

  @IsOptional()
  @IsString()
  dateRetourPrevue?: string;
}
