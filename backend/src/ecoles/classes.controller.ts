import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ClassesService } from './classes.service';
import { CreateClasseDto, UpdateClasseDto } from './dto/classe.dto';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(private service: ClassesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Get('effectifs')
  effectifs(@CurrentUser() user: JwtPayloadUser) {
    return this.service.effectifs(user.ecoleId);
  }

  @Get(':id/eleves')
  eleves(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.eleves(user.ecoleId, id);
  }

  @Post()
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateClasseDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Patch(':id')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  update(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateClasseDto) {
    return this.service.update(user.ecoleId, id, dto);
  }
}
