import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateNested } from 'class-validator';

export class NoteEntryDto {
  @IsString()
  eleveId: string;

  @IsString()
  matiereId: string;

  @IsNumber()
  @Min(0)
  @Max(10)
  valeur: number;

  @IsOptional()
  @IsString()
  appreciation?: string;
}

export class SaisirNotesDto {
  @IsString()
  classeId: string;

  @IsInt()
  @Min(1)
  @Max(3)
  trimestre: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => NoteEntryDto)
  entries: NoteEntryDto[];
}
