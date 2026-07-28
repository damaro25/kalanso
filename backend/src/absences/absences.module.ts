import { Module } from '@nestjs/common';
import { AbsencesController } from './absences.controller';
import { AbsencesService } from './absences.service';
import { CommunicationModule } from '../communication/communication.module';

@Module({
  imports: [CommunicationModule],
  controllers: [AbsencesController],
  providers: [AbsencesService],
  exports: [AbsencesService],
})
export class AbsencesModule {}
