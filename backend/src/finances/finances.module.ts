import { Module } from '@nestjs/common';
import { TarifsEcolageController } from './tarifs-ecolage.controller';
import { TarifsEcolageService } from './tarifs-ecolage.service';
import { FraisInscriptionNiveauController } from './frais-inscription-niveau.controller';
import { FraisInscriptionNiveauService } from './frais-inscription-niveau.service';
import { FacturesController } from './factures.controller';
import { FacturesService } from './factures.service';
import { PaiementsController } from './paiements.controller';
import { PaiementsService } from './paiements.service';

@Module({
  controllers: [TarifsEcolageController, FraisInscriptionNiveauController, FacturesController, PaiementsController],
  providers: [TarifsEcolageService, FraisInscriptionNiveauService, FacturesService, PaiementsService],
  exports: [FacturesService],
})
export class FinancesModule {}
