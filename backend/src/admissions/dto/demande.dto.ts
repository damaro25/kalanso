import { IsDateString, IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { Genre, Regime } from '../../generated/prisma/enums';

export class CreateDemandeDto {
  @IsString()
  ecoleId: string;

  @IsString()
  @MinLength(1)
  nomEleve: string;

  @IsString()
  @MinLength(1)
  prenomEleve: string;

  @IsEnum(Genre)
  genre: Genre;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  niveauId?: string;

  @IsOptional()
  @IsString()
  niveauSouhaite?: string;

  @IsString()
  @MinLength(1)
  nomParent: string;

  @IsString()
  @MinLength(1)
  prenomParent: string;

  @IsString()
  @MinLength(1)
  telephoneParent: string;

  @IsOptional()
  @IsEmail()
  emailParent?: string;

  @IsOptional()
  @IsString()
  piecesJointes?: string;
}

export class AccepterDemandeDto {
  @IsString()
  @MinLength(1)
  classeId: string;

  // Absent : externat.
  @IsOptional()
  @IsEnum(Regime)
  regime?: Regime;

  @IsOptional()
  @IsString()
  matricule?: string;
}

export class RefuserDemandeDto {
  @IsOptional()
  @IsString()
  motifRefus?: string;
}

// Inscription sur place : un élève reçu au secrétariat. Crée une demande
// EN_ATTENTE (comme le formulaire public), avec les mêmes pièces jointes
// possibles. L'élève n'est créé qu'au moment de l'acceptation de la demande.
export class InscriptionDirecteDto {
  @IsString()
  @MinLength(1)
  nomEleve: string;

  @IsString()
  @MinLength(1)
  prenomEleve: string;

  @IsEnum(Genre)
  genre: Genre;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsString()
  lieuNaissance?: string;

  @IsOptional()
  @IsString()
  niveauSouhaite?: string;

  @IsString()
  @MinLength(1)
  nomParent: string;

  @IsString()
  @MinLength(1)
  prenomParent: string;

  @IsString()
  @MinLength(1)
  telephoneParent: string;

  @IsOptional()
  @IsEmail()
  emailParent?: string;

  // Filiation (facultative) : père et mère

  @IsOptional()
  @IsString()
  perePrenom?: string;

  @IsOptional()
  @IsString()
  pereNom?: string;

  @IsOptional()
  @IsString()
  pereTelephone?: string;

  @IsOptional()
  @IsString()
  pereProfession?: string;

  @IsOptional()
  @IsString()
  merePrenom?: string;

  @IsOptional()
  @IsString()
  mereNom?: string;

  @IsOptional()
  @IsString()
  mereTelephone?: string;

  @IsOptional()
  @IsString()
  mereProfession?: string;
}
