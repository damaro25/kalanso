import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ParcoursController } from './parcours.controller';
import { ParcoursService } from './parcours.service';

@Module({
  imports: [FinancesModule],
  controllers: [ParcoursController],
  providers: [ParcoursService],
  exports: [ParcoursService],
})
export class ParcoursModule {}
