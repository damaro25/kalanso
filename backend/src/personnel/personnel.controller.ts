import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PersonnelService } from './personnel.service';
import { CreatePersonnelDto, UpdatePersonnelDto } from './dto/personnel.dto';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_GESTION)
export class PersonnelController {
  constructor(private service: PersonnelService) {}

  @Get('personnel')
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Get('personnel/:id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findOne(user.ecoleId, id);
  }

  @Post('personnel')
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreatePersonnelDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch('personnel/:id')
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdatePersonnelDto) {
    return this.service.update(user.ecoleId, id, dto);
  }

  @Delete('personnel/:id')
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }

  @Get('personnel/:id/salaire')
  salaireEnseignant(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.salaireEnseignant(user.ecoleId, id);
  }
}
