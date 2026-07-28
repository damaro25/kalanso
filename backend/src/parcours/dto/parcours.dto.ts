import { ArrayMinSize, IsArray, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class PassageEntryDto {
  @IsString()
  eleveId: string;

  @IsString()
  classeDestinationId: string;
}

export class ValiderPassageDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PassageEntryDto)
  entries: PassageEntryDto[];
}
