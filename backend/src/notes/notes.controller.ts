import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PerimetreService } from '../common/perimetre/perimetre.service';
import { NotesService } from './notes.service';
import { SaisirNotesDto } from './dto/note.dto';

@Controller('notes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NotesController {
  constructor(
    private service: NotesService,
    private perimetre: PerimetreService,
  ) {}

  @Get()
  async findByClasseTrimestre(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Query('trimestre') trimestre: string,
  ) {
    await this.perimetre.exigerClasse(user, classeId);
    return this.service.findByClasseTrimestre(user.ecoleId, classeId, Number(trimestre));
  }

  @Post()
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.ENSEIGNANT)
  async saisir(@CurrentUser() user: JwtPayloadUser, @Body() dto: SaisirNotesDto) {
    await this.perimetre.exigerClasse(user, dto.classeId);
    return this.service.saisir(user.ecoleId, dto);
  }
}
