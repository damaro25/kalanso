import { Body, Controller, Delete, ForbiddenException, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PerimetreService } from '../common/perimetre/perimetre.service';
import { EmploiDuTempsService } from './emploi-du-temps.service';
import { CreateCreneauDto } from './dto/creneau.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('emploi-du-temps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmploiDuTempsController {
  constructor(
    private service: EmploiDuTempsService,
    private perimetre: PerimetreService,
  ) {}

  @Get()
  async findByClasse(@CurrentUser() user: JwtPayloadUser, @Query('classeId') classeId: string) {
    await this.perimetre.exigerClasse(user, classeId);
    return this.service.findByClasse(user.ecoleId, classeId);
  }

  // Un enseignant ne consulte que son propre emploi du temps.
  @Get('personnel/:id')
  findByPersonnel(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    if (this.perimetre.estRestreint(user) && user.personnelId !== id) {
      throw new ForbiddenException('Vous ne pouvez consulter que votre propre emploi du temps');
    }
    return this.service.findByPersonnel(user.ecoleId, id);
  }

  @Post()
  @Roles(...ROLES_GESTION)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateCreneauDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Delete(':id')
  @Roles(...ROLES_GESTION)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }
}
