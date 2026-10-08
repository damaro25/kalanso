import { IsDateString, IsOptional, IsString, Matches } from 'class-validator';

const FORMAT_LIBELLE = /^\d{4}-\d{4}$/;
const MESSAGE_LIBELLE = 'Le libellé doit être de la forme AAAA-AAAA (ex: 2026-2027)';

export class CreateAnneeScolaireDto {
  @IsString()
  @Matches(FORMAT_LIBELLE, { message: MESSAGE_LIBELLE })
  libelle: string;

  @IsDateString()
  dateDebut: string;

  @IsDateString()
  dateFin: string;
}

// Le drapeau « courante » n'est volontairement pas modifiable ici : seule
// l'activation (PATCH :id/activer) le change, de façon exclusive, pour qu'il
// n'y ait jamais deux années courantes — ni aucune — par erreur.
export class UpdateAnneeScolaireDto {
  @IsOptional()
  @IsString()
  @Matches(FORMAT_LIBELLE, { message: MESSAGE_LIBELLE })
  libelle?: string;

  @IsOptional()
  @IsDateString()
  dateDebut?: string;

  @IsOptional()
  @IsDateString()
  dateFin?: string;
}
