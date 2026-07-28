import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ElevesService } from './eleves.service';
import { UpdateEleveDto } from './dto/eleve.dto';
import { CreateParentTuteurDto, LinkParentDto } from './dto/parent-tuteur.dto';
import { CreateInscriptionDto } from './dto/inscription.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ElevesController {
  constructor(private service: ElevesService) {}

  @Get('eleves')
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Get('eleves/:id/fiche')
  fiche(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.fiche(user.ecoleId, id);
  }

  // La création directe d'un élève est volontairement retirée : un élève ne peut
  // naître que d'une demande d'admission acceptée (voir module Admissions,
  // « inscription sur place » pour les élèves reçus au secrétariat).

  @Patch('eleves/:id')
  @Roles(...ROLES_GESTION)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateEleveDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Delete('eleves/:id')
  @Roles(...ROLES_GESTION)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }

  @Get('parents-tuteurs')
  findAllParents(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAllParents(user.ecoleId);
  }

  @Post('parents-tuteurs')
  @Roles(...ROLES_GESTION)
  createParent(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateParentTuteurDto) {
    return this.service.createParent(user.ecoleId, dto);
  }

  @Post('eleves/:id/parents')
  @Roles(...ROLES_GESTION)
  linkParent(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: LinkParentDto) {
    return this.service.linkParent(user.ecoleId, id, dto);
  }

  @Post('inscriptions')
  @Roles(...ROLES_GESTION)
  inscrire(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateInscriptionDto) {
    return this.service.inscrire(user.ecoleId, dto);
  }
}
