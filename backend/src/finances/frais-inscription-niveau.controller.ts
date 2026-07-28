import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { FraisInscriptionNiveauService } from './frais-inscription-niveau.service';
import { CreateFraisInscriptionNiveauDto, UpdateFraisInscriptionNiveauDto } from './dto/frais-inscription-niveau.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('frais-inscription-niveau')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FraisInscriptionNiveauController {
  constructor(private service: FraisInscriptionNiveauService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  @Roles(...ROLES_GESTION)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateFraisInscriptionNiveauDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(...ROLES_GESTION)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateFraisInscriptionNiveauDto) {
    return this.service.update(user.ecoleId, id, dto);
  }
}
