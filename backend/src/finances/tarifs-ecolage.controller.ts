import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { TarifsEcolageService } from './tarifs-ecolage.service';
import { CreateTarifEcolageDto, UpdateTarifEcolageDto } from './dto/tarif-ecolage.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('tarifs-ecolage')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TarifsEcolageController {
  constructor(private service: TarifsEcolageService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  @Roles(...ROLES_GESTION)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateTarifEcolageDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(...ROLES_GESTION)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateTarifEcolageDto) {
    return this.service.update(user.ecoleId, id, dto);
  }
}
