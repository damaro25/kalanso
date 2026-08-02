import { Module } from '@nestjs/common';
import { ReportingController } from './reporting.controller';
import { ReportingService } from './reporting.service';
import { ExportService } from './export.service';
import { NotesModule } from '../notes/notes.module';
import { PaieModule } from '../paie/paie.module';
import { LogistiqueModule } from '../logistique/logistique.module';
import { ParcoursModule } from '../parcours/parcours.module';

@Module({
  imports: [NotesModule, PaieModule, LogistiqueModule, ParcoursModule],
  controllers: [ReportingController],
  providers: [ReportingService, ExportService],
})
export class ReportingModule {}
