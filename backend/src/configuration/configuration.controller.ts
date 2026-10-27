import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ROLES_DIRECTION } from '../common/roles.constants';
import { ConfigurationService } from './configuration.service';
import { GrilleExcelService } from './grille-excel.service';
import { EcoleExcelService } from './ecole-excel.service';
import { MIMES_LOGO, TAILLE_MAX_LOGO, enregistrerLogo, supprimerLogo } from '../common/pdf/logo.util';
import { GrilleDto, UpdateEcoleDto } from './dto/configuration.dto';

// Mêmes rôles que la page Tarifs pour la grille ; coordonnées et fiche modèle réservées à la direction.
const multerOptionsImport = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('configuration')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ConfigurationController {
  constructor(
    private service: ConfigurationService,
    private grilleExcel: GrilleExcelService,
    private ecoleExcel: EcoleExcelService,
  ) {}

  @Get('ecole')
  @Roles(...ROLES_GESTION)
  ecole(@CurrentUser() user: JwtPayloadUser) {
    return this.service.ecole(user.ecoleId);
  }

  @Patch('ecole')
  @Roles(...ROLES_DIRECTION)
  updateEcole(@CurrentUser() user: JwtPayloadUser, @Body() dto: UpdateEcoleDto) {
    return this.service.updateEcole(user.ecoleId, dto);
  }

  // Logo de l'école : remplace celui de l'application et des documents (reçus, factures, bulletins...)
  @Post('ecole/logo')
  @Roles(...ROLES_DIRECTION)
  @UseInterceptors(FileInterceptor('fichier', { storage: memoryStorage(), limits: { fileSize: TAILLE_MAX_LOGO } }))
  envoyerLogo(@UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    if (!MIMES_LOGO.includes(fichier.mimetype)) throw new BadRequestException('Le logo doit être une image PNG ou JPEG');
    enregistrerLogo(fichier.buffer, fichier.mimetype);
    return { ok: true };
  }

  @Delete('ecole/logo')
  @Roles(...ROLES_DIRECTION)
  retirerLogo() {
    supprimerLogo();
    return { ok: true };
  }

  // Coordonnées de l'école en Excel : export (gestion), import avec aperçu (direction, comme la modification à l'écran)
  @Get('ecole/export.xlsx')
  @Roles(...ROLES_GESTION)
  async exporterEcole(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.ecoleExcel.exporter(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="coordonnees-ecole.xlsx"',
    });
    res.send(buffer);
  }

  @Post('ecole/import/apercu')
  @Roles(...ROLES_DIRECTION)
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  apercuEcole(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.ecoleExcel.apercu(user.ecoleId, fichier.buffer);
  }

  @Post('ecole/import')
  @Roles(...ROLES_DIRECTION)
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  importerEcole(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.ecoleExcel.importer(user.ecoleId, fichier.buffer);
  }

  @Get('grille/:anneeScolaireId')
  @Roles(...ROLES_GESTION)
  grille(@CurrentUser() user: JwtPayloadUser, @Param('anneeScolaireId') anneeScolaireId: string) {
    return this.service.grille(user.ecoleId, anneeScolaireId);
  }

  // Grille tarifaire en Excel : export, puis import du même fichier (aperçu des changements, puis confirmation).
  @Get('grille/:anneeScolaireId/export.xlsx')
  @Roles(...ROLES_GESTION)
  async exporterGrille(@CurrentUser() user: JwtPayloadUser, @Param('anneeScolaireId') anneeScolaireId: string, @Res() res: Response) {
    const { buffer, nomFichier } = await this.grilleExcel.exporter(user.ecoleId, anneeScolaireId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
    });
    res.send(buffer);
  }

  @Post('grille/:anneeScolaireId/import/apercu')
  @Roles(...ROLES_GESTION)
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  apercuGrille(
    @CurrentUser() user: JwtPayloadUser,
    @Param('anneeScolaireId') anneeScolaireId: string,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.grilleExcel.apercu(user.ecoleId, anneeScolaireId, fichier.buffer);
  }

  @Post('grille/:anneeScolaireId/import')
  @Roles(...ROLES_GESTION)
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  importerGrille(
    @CurrentUser() user: JwtPayloadUser,
    @Param('anneeScolaireId') anneeScolaireId: string,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.grilleExcel.importer(user.ecoleId, anneeScolaireId, fichier.buffer);
  }

  @Put('grille/:anneeScolaireId')
  @Roles(...ROLES_GESTION)
  enregistrerGrille(
    @CurrentUser() user: JwtPayloadUser,
    @Param('anneeScolaireId') anneeScolaireId: string,
    @Body() dto: GrilleDto,
  ) {
    return this.service.enregistrerGrille(user.ecoleId, anneeScolaireId, dto);
  }

  @Post('modele-mame-ta')
  @Roles(...ROLES_DIRECTION)
  chargerModeleMameTa(@CurrentUser() user: JwtPayloadUser) {
    return this.service.chargerModeleMameTa(user.ecoleId);
  }
}
