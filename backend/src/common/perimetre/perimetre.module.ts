import { Global, Module } from '@nestjs/common';
import { PerimetreService } from './perimetre.service';

// Global : tous les contrôleurs qui exposent des données d'élèves ou de classes en ont besoin.
@Global()
@Module({
  providers: [PerimetreService],
  exports: [PerimetreService],
})
export class PerimetreModule {}
