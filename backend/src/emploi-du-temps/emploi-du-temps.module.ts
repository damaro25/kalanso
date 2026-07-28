import { Module } from '@nestjs/common';
import { EmploiDuTempsController } from './emploi-du-temps.controller';
import { EmploiDuTempsService } from './emploi-du-temps.service';
import { SallesController } from './salles.controller';
import { SallesService } from './salles.service';

@Module({
  controllers: [EmploiDuTempsController, SallesController],
  providers: [EmploiDuTempsService, SallesService],
})
export class EmploiDuTempsModule {}
