import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { UtilisateursService } from './utilisateurs.service';
import { CreateUtilisateurDto } from './dto/utilisateur.dto';

@Controller('utilisateurs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
export class UtilisateursController {
  constructor(private service: UtilisateursService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateUtilisateurDto) {
    return this.service.create(user.ecoleId, dto);
  }
}
