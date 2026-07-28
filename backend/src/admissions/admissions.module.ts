import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { DocumentsService } from './documents.service';

@Module({
  imports: [FinancesModule],
  controllers: [AdmissionsController],
  providers: [AdmissionsService, DocumentsService],
})
export class AdmissionsModule {}
