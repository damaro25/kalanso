import { Module } from '@nestjs/common';
import { LogistiqueController } from './logistique.controller';
import { LogistiqueService } from './logistique.service';

@Module({
  controllers: [LogistiqueController],
  providers: [LogistiqueService],
  exports: [LogistiqueService],
})
export class LogistiqueModule {}
