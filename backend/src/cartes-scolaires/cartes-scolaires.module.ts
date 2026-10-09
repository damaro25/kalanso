import { Module } from '@nestjs/common';
import { CartesScolairesController } from './cartes-scolaires.controller';
import { CartesScolairesService } from './cartes-scolaires.service';

@Module({
  controllers: [CartesScolairesController],
  providers: [CartesScolairesService],
})
export class CartesScolairesModule {}
