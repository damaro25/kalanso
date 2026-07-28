import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { BibliothequeService } from './bibliotheque.service';
import { CreateLivreDto, UpdateLivreDto } from './dto/livre.dto';
import { CreateEmpruntDto } from './dto/emprunt.dto';

const ROLES_GESTION = [
  RoleUtilisateur.FONDATEUR,
  RoleUtilisateur.CHEF_ETABLISSEMENT,
  RoleUtilisateur.SECRETAIRE,
];

@Controller('bibliotheque')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_GESTION)
export class BibliothequeController {
  constructor(private service: BibliothequeService) {}

  @Get('resume')
  resume(@CurrentUser() user: JwtPayloadUser) {
    return this.service.resume(user.ecoleId);
  }

  @Get('livres')
  findAllLivres(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAllLivres(user.ecoleId);
  }

  @Post('livres')
  createLivre(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateLivreDto) {
    return this.service.createLivre(user.ecoleId, dto);
  }

  @Patch('livres/:id')
  updateLivre(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: UpdateLivreDto) {
    return this.service.updateLivre(user.ecoleId, id, dto);
  }

  @Delete('livres/:id')
  removeLivre(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.removeLivre(user.ecoleId, id);
  }

  @Get('emprunts')
  findEmprunts(@CurrentUser() user: JwtPayloadUser, @Query('statut') statut?: string) {
    const s = statut === 'EN_COURS' || statut === 'RETOURNE' ? statut : undefined;
    return this.service.findEmprunts(user.ecoleId, s);
  }

  @Post('emprunts')
  emprunter(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateEmpruntDto) {
    return this.service.emprunter(user.ecoleId, dto);
  }

  @Post('emprunts/:id/retour')
  retourner(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.retourner(user.ecoleId, id);
  }
}
