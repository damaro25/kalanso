import { Module } from '@nestjs/common';
import { PaieController } from './paie.controller';
import { PaieService } from './paie.service';
import { PersonnelModule } from '../personnel/personnel.module';

@Module({
  imports: [PersonnelModule],
  controllers: [PaieController],
  providers: [PaieService],
  exports: [PaieService],
})
export class PaieModule {}
