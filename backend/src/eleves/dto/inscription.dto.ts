import { IsEnum, IsOptional, IsString } from 'class-validator';
import { Regime } from '../../generated/prisma/enums';

export class CreateInscriptionDto {
  @IsString()
  eleveId: string;

  @IsString()
  classeId: string;

  // Absent : externat pour une nouvelle inscription, régime inchangé pour une inscription existante.
  @IsOptional()
  @IsEnum(Regime)
  regime?: Regime;
}
