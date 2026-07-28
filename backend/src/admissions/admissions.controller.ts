import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
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
import { AdmissionsService } from './admissions.service';
import { DocumentsService } from './documents.service';
import {
  AccepterDemandeDto,
  CreateDemandeDto,
  InscriptionDirecteDto,
  RefuserDemandeDto,
} from './dto/demande.dto';
import { multerOptionsDocuments } from './upload.config';

const ROLES_GESTION = [
  RoleUtilisateur.FONDATEUR,
  RoleUtilisateur.CHEF_ETABLISSEMENT,
  RoleUtilisateur.SECRETAIRE,
];

@Controller('admissions')
export class AdmissionsController {
  constructor(
    private service: AdmissionsService,
    private documentsService: DocumentsService,
  ) {}

  // ---- Endpoints publics (aucune authentification) ----

  @Get('ecole/:ecoleId')
  ecolePublique(@Param('ecoleId') ecoleId: string) {
    return this.service.ecolePublique(ecoleId);
  }

  @Post()
  creerDemande(@Body() dto: CreateDemandeDto) {
    return this.service.creerDemande(dto);
  }

  // Public : le parent joint un document (attestation, relevé de notes...) à sa demande.
  @Post(':id/documents')
  @UseInterceptors(FileInterceptor('fichier', multerOptionsDocuments))
  ajouterDocument(
    @Param('id') id: string,
    @Body('type') type: string,
    @UploadedFile() fichier?: Express.Multer.File,
  ) {
    if (!fichier) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.documentsService.ajouter(id, type, fichier);
  }

  // ---- Endpoints direction (authentifiés) ----

  @Get('documents/:documentId/telecharger')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  async telechargerDocument(
    @CurrentUser() user: JwtPayloadUser,
    @Param('documentId') documentId: string,
    @Res() res: Response,
  ) {
    const { document, chemin } = await this.documentsService.pourTelechargement(user.ecoleId, documentId);
    res.set({
      'Content-Type': document.mimeType,
      'Content-Disposition': `inline; filename="${document.nomFichier}"`,
    });
    res.sendFile(chemin);
  }

  @Post('documents/:documentId/verifier')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  verifierDocument(
    @CurrentUser() user: JwtPayloadUser,
    @Param('documentId') documentId: string,
    @Body('statut') statut: string,
    @Body('commentaire') commentaire?: string,
  ) {
    return this.documentsService.verifier(user.ecoleId, documentId, statut, commentaire, user.userId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  findAll(@CurrentUser() user: JwtPayloadUser, @Query('statut') statut?: string) {
    return this.service.findAll(user.ecoleId, statut);
  }

  @Post(':id/accepter')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  accepter(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: AccepterDemandeDto) {
    return this.service.accepter(user.ecoleId, id, dto, user.userId);
  }

  @Post(':id/refuser')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  refuser(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Body() dto: RefuserDemandeDto) {
    return this.service.refuser(user.ecoleId, id, dto, user.userId);
  }

  // Annule une admission déjà acceptée : supprime l'élève et tout ce qui en
  // dépend, remet la demande en attente. Réservé au fondateur/chef d'établissement
  // vu la portée de la suppression (données financières et pédagogiques incluses).
  @Post(':id/annuler')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  annuler(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.annuler(user.ecoleId, id, user.userId);
  }

  // Annule un refus (remet en attente) : aucune donnée n'est perdue, mêmes
  // rôles que pour accepter/refuser une demande.
  @Post(':id/annuler-refus')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  annulerRefus(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.annulerRefus(user.ecoleId, id, user.userId);
  }

  @Get('historique-annulations')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  historiqueAnnulations(@CurrentUser() user: JwtPayloadUser) {
    return this.service.historiqueAnnulations(user.ecoleId);
  }

  // Secrétariat : élève reçu directement au bureau, sans passer par le formulaire public.
  @Post('inscription-directe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(...ROLES_GESTION)
  inscrireSurPlace(@CurrentUser() user: JwtPayloadUser, @Body() dto: InscriptionDirecteDto) {
    return this.service.inscrireSurPlace(user.ecoleId, dto);
  }
}
