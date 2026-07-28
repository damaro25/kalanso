import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceExportService } from './finance-export.service';

@Module({
  imports: [FinancesModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceExportService],
})
export class FinanceModule {}
