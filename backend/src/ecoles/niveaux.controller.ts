import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { NiveauxService } from './niveaux.service';
import { CreateNiveauDto, UpdateNiveauDto } from './dto/niveau.dto';

@Controller('niveaux')
@UseGuards(JwtAuthGuard, RolesGuard)
export class NiveauxController {
  constructor(private service: NiveauxService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateNiveauDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateNiveauDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Delete(':id')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }
}
