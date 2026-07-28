import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class CreateParentTuteurDto {
  @IsString()
  nom: string;

  @IsString()
  prenom: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  profession?: string;
}

export class LinkParentDto {
  @IsString()
  parentTuteurId: string;

  @IsString()
  lien: string;

  @IsOptional()
  @IsBoolean()
  contactPrincipal?: boolean;
}
