import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { LogistiqueService } from './logistique.service';
import { CreateMaterielDto, UpdateMaterielDto } from './dto/materiel.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('materiel')
@UseGuards(JwtAuthGuard, RolesGuard)
export class LogistiqueController {
  constructor(private service: LogistiqueService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayloadUser,
    @Query('categorie') categorie?: string,
    @Query('etat') etat?: string,
    @Query('salleId') salleId?: string,
  ) {
    return this.service.findAll(user.ecoleId, { categorie, etat, salleId });
  }

  @Get('resume')
  resume(@CurrentUser() user: JwtPayloadUser) {
    return this.service.resume(user.ecoleId);
  }

  @Post()
  @Roles(...ROLES_GESTION)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateMaterielDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(...ROLES_GESTION)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateMaterielDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Delete(':id')
  @Roles(...ROLES_GESTION)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }
}
