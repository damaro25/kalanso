import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { NB_TRANCHES, type GrilleRegime, type Tranches } from '../grille';

export class UpdateEcoleDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  sigle?: string;

  @IsOptional()
  @IsString()
  ville?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== '')
  @IsEmail()
  email?: string;

  // Signataires du bordereau journalier
  @IsOptional()
  @IsString()
  nomDirecteur?: string;

  @IsOptional()
  @IsString()
  nomComptable?: string;

  // Premier N° de reçu à attribuer (pour continuer le carnet papier) ; null l'efface
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(1)
  numeroRecuDepart?: number | null;

  // Cartes de retrait (maternelle) : en-tête et signataire ; vide = valeur par défaut
  @IsOptional()
  @IsString()
  carteRetraitMinistere?: string;

  @IsOptional()
  @IsString()
  carteRetraitDev?: string;

  @IsOptional()
  @IsString()
  carteRetraitDce?: string;

  @IsOptional()
  @IsString()
  carteRetraitSignataire?: string;
}

export class GrilleNiveauDto {
  @IsString()
  niveauId: string;

  // null : pas de frais d'inscription pour ce niveau.
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  fraisInscription: number | null;

  // null : le montant « nouveaux » s'applique aussi aux réinscriptions.
  @ValidateIf((_o, v) => v !== null)
  @IsNumber()
  @Min(0)
  fraisReinscription: number | null;

  // Par régime, le montant des trois tranches (null ou 0 : pas de tranche).
  // Contenu vérifié par ConfigurationService.verifierGrille.
  @IsObject()
  tarifs: Partial<Record<GrilleRegime, Tranches>>;
}

export class GrilleDto {
  // Échéance de chaque tranche (AAAA-MM-JJ), reportée sur les factures (null : sans échéance).
  // Contenu vérifié par ConfigurationService.verifierGrille.
  @IsArray()
  @ArrayMinSize(NB_TRANCHES)
  @ArrayMaxSize(NB_TRANCHES)
  echeances: (string | null)[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => GrilleNiveauDto)
  niveaux: GrilleNiveauDto[];
}
