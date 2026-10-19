import { Module } from '@nestjs/common';
import { ConfigurationController } from './configuration.controller';
import { ConfigurationService } from './configuration.service';
import { GrilleExcelService } from './grille-excel.service';
import { EcoleExcelService } from './ecole-excel.service';

@Module({
  controllers: [ConfigurationController],
  providers: [ConfigurationService, GrilleExcelService, EcoleExcelService],
})
export class ConfigurationModule {}
