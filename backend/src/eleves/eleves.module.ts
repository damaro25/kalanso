import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ElevesController } from './eleves.controller';
import { ElevesService } from './eleves.service';

@Module({
  imports: [FinancesModule],
  controllers: [ElevesController],
  providers: [ElevesService],
  exports: [ElevesService],
})
export class ElevesModule {}
