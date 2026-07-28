import { Module } from '@nestjs/common';
import { MatieresController } from './matieres.controller';
import { MatieresService } from './matieres.service';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { BulletinService } from './bulletin.service';

@Module({
  controllers: [MatieresController, NotesController],
  providers: [MatieresService, NotesService, BulletinService],
  exports: [BulletinService],
})
export class NotesModule {}
