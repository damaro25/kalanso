import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { FinanceExportService } from './finance-export.service';
import { BudgetService } from './budget.service';
import { ClotureService } from './cloture.service';

@Module({
  imports: [FinancesModule],
  controllers: [FinanceController],
  providers: [FinanceService, FinanceExportService, BudgetService, ClotureService],
})
export class FinanceModule {}
