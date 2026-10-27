import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Put, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { multerOptionsDocuments } from '../admissions/upload.config';
import { ElevesDocumentsService } from './eleves-documents.service';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE];

// Pièces du dossier d'un élève : liste, ajout, modification (type ou fichier), suppression, téléchargement.
@Controller('eleves/:id/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_GESTION)
export class ElevesDocumentsController {
  constructor(private service: ElevesDocumentsService) {}

  @Get()
  lister(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.lister(user.ecoleId, id);
  }

  @Post()
  @UseInterceptors(FileInterceptor('fichier', multerOptionsDocuments))
  ajouter(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body('type') type: string,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.service.ajouter(user.ecoleId, id, type, fichier);
  }

  @Put(':documentId')
  @UseInterceptors(FileInterceptor('fichier', multerOptionsDocuments))
  modifier(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Body('type') type?: string,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    return this.service.modifier(user.ecoleId, id, documentId, type || undefined, fichier);
  }

  @Delete(':documentId')
  supprimer(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Param('documentId') documentId: string) {
    return this.service.supprimer(user.ecoleId, id, documentId);
  }

  @Get(':documentId/fichier')
  async telecharger(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { document, chemin } = await this.service.pourTelechargement(user.ecoleId, id, documentId);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(document.nomFichier)}`,
    });
    res.sendFile(chemin);
  }
}
