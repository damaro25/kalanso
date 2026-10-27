import { Module } from '@nestjs/common';
import { FinancesModule } from '../finances/finances.module';
import { ElevesController } from './eleves.controller';
import { ElevesService } from './eleves.service';
import { ElevesImportExportController } from './eleves-import-export.controller';
import { ElevesImportExportService } from './eleves-import-export.service';
import { ElevesDocumentsController } from './eleves-documents.controller';
import { ElevesDocumentsService } from './eleves-documents.service';

@Module({
  imports: [FinancesModule],
  controllers: [ElevesImportExportController, ElevesDocumentsController, ElevesController],
  providers: [ElevesService, ElevesImportExportService, ElevesDocumentsService],
  exports: [ElevesService],
})
export class ElevesModule {}
