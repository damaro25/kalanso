import { Module } from '@nestjs/common';
import { BibliothequeController } from './bibliotheque.controller';
import { BibliothequeService } from './bibliotheque.service';

@Module({
  controllers: [BibliothequeController],
  providers: [BibliothequeService],
})
export class BibliothequeModule {}
