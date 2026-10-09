import { ArrayUnique, IsArray, IsString } from 'class-validator';

export class AffecterClassesDto {
  // Classes de l'année en cours confiées à l'enseignant, en plus de celles de son emploi du temps.
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  classeIds: string[];
}
