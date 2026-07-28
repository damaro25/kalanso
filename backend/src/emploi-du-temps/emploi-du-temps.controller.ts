import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { EmploiDuTempsService } from './emploi-du-temps.service';
import { CreateCreneauDto } from './dto/creneau.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('emploi-du-temps')
@UseGuards(JwtAuthGuard, RolesGuard)
export class EmploiDuTempsController {
  constructor(private service: EmploiDuTempsService) {}

  @Get()
  findByClasse(@CurrentUser() user: JwtPayloadUser, @Query('classeId') classeId: string) {
    return this.service.findByClasse(user.ecoleId, classeId);
  }

  @Get('personnel/:id')
  findByPersonnel(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
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
