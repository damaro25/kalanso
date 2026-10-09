import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PerimetreService } from '../common/perimetre/perimetre.service';
import { ClassesService } from './classes.service';
import { CreateClasseDto, UpdateClasseDto } from './dto/classe.dto';

@Controller('classes')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ClassesController {
  constructor(
    private service: ClassesService,
    private perimetre: PerimetreService,
  ) {}

  // ?courante=true : uniquement les classes de l'année scolaire en cours (filtres et sélecteurs)
  @Get()
  async findAll(@CurrentUser() user: JwtPayloadUser, @Query('courante') courante?: string) {
    return this.service.findAll(user.ecoleId, {
      courante: courante === 'true',
      classeIds: await this.perimetre.classesAutorisees(user),
    });
  }

  @Get('effectifs')
  async effectifs(@CurrentUser() user: JwtPayloadUser) {
    return this.service.effectifs(user.ecoleId, await this.perimetre.classesAutorisees(user));
  }

  @Get(':id/eleves')
  async eleves(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    await this.perimetre.exigerClasse(user, id);
    const eleves = await this.service.eleves(user.ecoleId, id);
    return this.perimetre.estRestreint(user) ? eleves.map(({ adresse: _adresse, ...sansAdresse }) => sansAdresse) : eleves;
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

  @Delete(':id')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  remove(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.remove(user.ecoleId, id);
  }
}
