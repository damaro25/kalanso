import { Module } from '@nestjs/common';
import { AnneesScolairesController } from './annees-scolaires.controller';
import { AnneesScolairesService } from './annees-scolaires.service';
import { NiveauxController } from './niveaux.controller';
import { NiveauxService } from './niveaux.service';
import { ClassesController } from './classes.controller';
import { ClassesService } from './classes.service';
import { UtilisateursController } from './utilisateurs.controller';
import { UtilisateursService } from './utilisateurs.service';
import { EcolePubliqueController } from './ecole-publique.controller';

@Module({
  controllers: [AnneesScolairesController, NiveauxController, ClassesController, UtilisateursController, EcolePubliqueController],
  providers: [AnneesScolairesService, NiveauxService, ClassesService, UtilisateursService],
  exports: [ClassesService],
})
export class EcolesModule {}
