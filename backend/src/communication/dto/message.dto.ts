import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class EnvoyerMessageDto {
  @ValidateIf((dto) => !dto.classeId)
  @IsString()
  eleveId?: string;

  @ValidateIf((dto) => !dto.eleveId)
  @IsString()
  classeId?: string;

  @IsString()
  @MinLength(1)
  contenu: string;

  @IsOptional()
  @IsString()
  objet?: string;
}
