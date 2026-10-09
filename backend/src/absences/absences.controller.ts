import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PerimetreService } from '../common/perimetre/perimetre.service';
import { AbsencesService } from './absences.service';
import { CreateAppelDto } from './dto/appel.dto';

@Controller('absences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbsencesController {
  constructor(
    private service: AbsencesService,
    private perimetre: PerimetreService,
  ) {}

  @Post('appel')
  async enregistrerAppel(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateAppelDto) {
    await this.perimetre.exigerClasse(user, dto.classeId);
    return this.service.enregistrerAppel(user.ecoleId, dto, user.userId);
  }

  @Get()
  async findByClasseAndDate(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Query('date') date: string,
  ) {
    await this.perimetre.exigerClasse(user, classeId);
    return this.service.findByClasseAndDate(user.ecoleId, classeId, date);
  }

  @Get('eleve/:id')
  async findByEleve(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    await this.perimetre.exigerEleve(user, id);
    return this.service.findByEleve(user.ecoleId, id);
  }

  // Sans classe précisée, un enseignant obtient le cumul de toutes ses classes.
  @Get('stats')
  async stats(@CurrentUser() user: JwtPayloadUser, @Query('classeId') classeId?: string) {
    if (classeId) await this.perimetre.exigerClasse(user, classeId);
    return this.service.stats(user.ecoleId, classeId, await this.perimetre.classesAutorisees(user));
  }
}
