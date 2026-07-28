import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsOptional, IsString, ValidateNested } from 'class-validator';
import { StatutAbsence } from '../../generated/prisma/enums';

export class AppelEleveDto {
  @IsString()
  eleveId: string;

  @IsEnum(StatutAbsence)
  statut: StatutAbsence;

  @IsOptional()
  @IsString()
  motif?: string;
}

export class CreateAppelDto {
  @IsString()
  classeId: string;

  @IsDateString()
  date: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AppelEleveDto)
  entries: AppelEleveDto[];
}
