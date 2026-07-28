import { Body, Controller, Delete, Get, Param, Query, UseGuards, Post, Patch } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { MatieresService } from './matieres.service';
import { CreateMatiereDto, UpdateMatiereDto } from './dto/matiere.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('matieres')
@UseGuards(JwtAuthGuard, RolesGuard)
export class MatieresController {
  constructor(private service: MatieresService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser, @Query('niveauId') niveauId?: string) {
    return this.service.findAll(user.ecoleId, niveauId);
  }

  @Post()
  @Roles(...ROLES_GESTION)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateMatiereDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(...ROLES_GESTION)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateMatiereDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Delete(':id')
  @Roles(...ROLES_GESTION)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }
}
