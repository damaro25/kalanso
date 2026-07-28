import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { AnneesScolairesService } from './annees-scolaires.service';
import { CreateAnneeScolaireDto, UpdateAnneeScolaireDto } from './dto/annee-scolaire.dto';

@Controller('annees-scolaires')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AnneesScolairesController {
  constructor(private service: AnneesScolairesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateAnneeScolaireDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateAnneeScolaireDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Patch(':id/activer')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  activer(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.activer(user.ecoleId, id);
  }
}
