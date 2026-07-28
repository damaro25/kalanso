import { IsInt, IsOptional, IsString } from 'class-validator';

export class CreateNiveauDto {
  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  cycle?: string;

  @IsOptional()
  @IsInt()
  ordre?: number;
}

export class UpdateNiveauDto {
  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  cycle?: string;

  @IsOptional()
  @IsInt()
  ordre?: number;
}
