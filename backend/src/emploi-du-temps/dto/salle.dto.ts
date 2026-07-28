import { IsInt, IsOptional, IsPositive, IsString } from 'class-validator';

export class CreateSalleDto {
  @IsString()
  nom: string;

  @IsOptional()
  @IsInt()
  @IsPositive()
  capacite?: number;
}
