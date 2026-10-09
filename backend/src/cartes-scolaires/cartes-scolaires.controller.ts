import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { CartesScolairesService } from './cartes-scolaires.service';
import { multerOptionsPhoto } from './photo-upload.config';

// Mêmes rôles que la gestion des élèves : la photo et la carte sont des données d'identité.
export const ROLES_CARTES: RoleUtilisateur[] = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_CARTES)
export class CartesScolairesController {
  constructor(private service: CartesScolairesService) {}

  @Get('eleves/:eleveId/photo')
  async photo(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string, @Res() res: Response) {
    const { contenu, mime } = await this.service.lirePhotoEleve(user.ecoleId, eleveId);
    res.set({ 'Content-Type': mime, 'Cache-Control': 'private, no-cache' });
    res.send(contenu);
  }

  @Post('eleves/:eleveId/photo')
  @UseInterceptors(FileInterceptor('photo', multerOptionsPhoto))
  televerserPhoto(
    @CurrentUser() user: JwtPayloadUser,
    @Param('eleveId') eleveId: string,
    @UploadedFile() fichier: { filename: string; path: string; mimetype: string } | undefined,
  ) {
    if (!fichier) throw new BadRequestException('Aucune photo reçue (champ « photo »)');
    return this.service.televerserPhoto(user.ecoleId, eleveId, fichier);
  }

  @Delete('eleves/:eleveId/photo')
  supprimerPhoto(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string) {
    return this.service.supprimerPhoto(user.ecoleId, eleveId);
  }

  @Get('cartes-scolaires/eleve/:eleveId')
  infoEleve(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string) {
    return this.service.infoEleve(user.ecoleId, eleveId);
  }

  @Get('cartes-scolaires/eleve/:eleveId/pdf')
  async pdfEleve(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string, @Res() res: Response) {
    const { pdf, nomFichier } = await this.service.pdfEleve(user.ecoleId, eleveId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nomFichier}"` });
    res.send(pdf);
  }

  @Get('cartes-scolaires/classe/:classeId')
  apercuClasse(@CurrentUser() user: JwtPayloadUser, @Param('classeId') classeId: string) {
    return this.service.apercuClasse(user.ecoleId, classeId);
  }

  @Get('cartes-scolaires/classe/:classeId/pdf')
  async pdfClasse(@CurrentUser() user: JwtPayloadUser, @Param('classeId') classeId: string, @Res() res: Response) {
    const { pdf, nomFichier } = await this.service.pdfClasse(user.ecoleId, classeId);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${nomFichier}"` });
    res.send(pdf);
  }
}
