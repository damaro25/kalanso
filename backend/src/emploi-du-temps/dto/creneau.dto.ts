import { IsEnum, IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';
import { JourSemaine } from '../../generated/prisma/enums';

const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateCreneauDto {
  @IsString()
  classeId: string;

  @IsString()
  matiereId: string;

  @IsOptional()
  @IsString()
  personnelId?: string;

  @IsOptional()
  @IsString()
  salleId?: string;

  @IsEnum(JourSemaine)
  jour: JourSemaine;

  @Matches(FORMAT_HEURE, { message: 'heureDebut doit être au format HH:MM' })
  heureDebut: string;

  @Matches(FORMAT_HEURE, { message: 'heureFin doit être au format HH:MM' })
  heureFin: string;

  // Taux horaire (GNF) payé à l'enseignant pour ce créneau ; sert de base au
  // calcul du salaire mensuel (voir PersonnelService.salaireEnseignant).
  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxHoraire?: number;
}
