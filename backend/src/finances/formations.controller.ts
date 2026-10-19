import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { FormationsService } from './formations.service';
import { FacturerFormationsDto, FormationDto, InscrireFormationDto, ModifierFormationDto } from './dto/formation.dto';

// Catalogue et facturation : direction et comptable. Inscrire un élève : aussi le secrétariat.
const ROLES_FINANCES = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];
const ROLES_ELEVES = [...ROLES_FINANCES, RoleUtilisateur.SECRETAIRE];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FormationsController {
  constructor(private service: FormationsService) {}

  @Get('formations')
  @Roles(...ROLES_ELEVES)
  catalogue(@CurrentUser() user: JwtPayloadUser) {
    return this.service.catalogue(user.ecoleId);
  }

  @Post('formations')
  @Roles(...ROLES_FINANCES)
  creer(@CurrentUser() user: JwtPayloadUser, @Body() dto: FormationDto) {
    return this.service.creer(user.ecoleId, dto);
  }

  @Post('formations/habituelles')
  @Roles(...ROLES_FINANCES)
  ajouterHabituelles(@CurrentUser() user: JwtPayloadUser) {
    return this.service.ajouterHabituelles(user.ecoleId);
  }

  @Post('formations/facturer')
  @Roles(...ROLES_FINANCES)
  facturer(@CurrentUser() user: JwtPayloadUser, @Body() dto: FacturerFormationsDto) {
    return this.service.facturerMois(user.ecoleId, dto.mois, dto.eleveId);
  }

  @Patch('formations/:id')
  @Roles(...ROLES_FINANCES)
  modifier(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: ModifierFormationDto) {
    return this.service.modifier(user.ecoleId, id, dto);
  }

  @Delete('formations/:id')
  @Roles(...ROLES_FINANCES)
  supprimer(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.supprimer(user.ecoleId, id);
  }

  @Get('eleves/:id/formations')
  @Roles(...ROLES_ELEVES)
  formationsEleve(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.formationsEleve(user.ecoleId, id);
  }

  @Post('eleves/:id/formations')
  @Roles(...ROLES_ELEVES)
  inscrire(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: InscrireFormationDto) {
    return this.service.inscrire(user.ecoleId, id, dto.formationId);
  }

  @Delete('eleves/:id/formations/:formationId')
  @Roles(...ROLES_ELEVES)
  desinscrire(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Param('formationId') formationId: string) {
    return this.service.desinscrire(user.ecoleId, id, formationId);
  }
}
