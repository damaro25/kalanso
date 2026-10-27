import { Type } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator';

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

export class PersonneFiliationDto {
  @IsOptional()
  @IsString()
  prenom?: string;

  @IsOptional()
  @IsString()
  nom?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  profession?: string;
}

// Parent / tuteur à contacter (contact principal : SMS, rappels).
export class ContactPrincipalDto {
  @IsString()
  prenom: string;

  @IsString()
  nom: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  lien?: string;
}

// Père et mère de l'élève ; une personne sans prénom ni nom (ou null) retire le lien.
// Contact principal facultatif : mis à jour (ou créé) s'il est fourni.
export class FiliationDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => ContactPrincipalDto)
  contact?: ContactPrincipalDto;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonneFiliationDto)
  pere?: PersonneFiliationDto | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => PersonneFiliationDto)
  mere?: PersonneFiliationDto | null;
}
