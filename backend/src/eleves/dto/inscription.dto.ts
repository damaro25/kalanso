import { IsString } from 'class-validator';

export class CreateInscriptionDto {
  @IsString()
  eleveId: string;

  @IsString()
  classeId: string;
}
