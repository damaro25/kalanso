import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ParcoursService } from './parcours.service';
import { ValiderPassageDto } from './dto/parcours.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('parcours')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_GESTION)
export class ParcoursController {
  constructor(private service: ParcoursService) {}

  @Get('classe/:classeId')
  parcoursClasse(@CurrentUser() user: JwtPayloadUser, @Param('classeId') classeId: string) {
    return this.service.parcoursClasse(user.ecoleId, classeId);
  }

  @Get('classe/:classeId/destinations')
  classesDestination(@CurrentUser() user: JwtPayloadUser, @Param('classeId') classeId: string) {
    return this.service.classesDestination(user.ecoleId, classeId);
  }

  @Post('valider')
  validerPassage(@CurrentUser() user: JwtPayloadUser, @Body() dto: ValiderPassageDto) {
    return this.service.validerPassage(user.ecoleId, dto);
  }
}
