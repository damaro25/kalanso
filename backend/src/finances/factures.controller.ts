import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { FacturesService } from './factures.service';
import { CreateFactureDto } from './dto/facture.dto';
import { genererFacturePdf } from './facture-pdf.util';

const multerOptionsImport = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

const ROLES_FINANCES = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FacturesController {
  constructor(private service: FacturesService) {}

  @Get('factures/impayes')
  @Roles(...ROLES_FINANCES)
  findImpayes(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findImpayes(user.ecoleId);
  }

  @Get('factures/:id')
  @Roles(...ROLES_FINANCES)
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findOne(user.ecoleId, id);
  }

  @Post('factures')
  @Roles(...ROLES_FINANCES)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateFactureDto) {
    return this.service.create(user.ecoleId, dto);
  }

  @Post('factures/import')
  @Roles(...ROLES_FINANCES)
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  importFactures(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.service.importXlsx(user.ecoleId, fichier.buffer);
  }

  @Get('eleves/:id/solde')
  @Roles(...ROLES_FINANCES)
  soldeEleve(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.soldeEleve(user.ecoleId, id);
  }

  @Get('factures/:id/pdf')
  @Roles(...ROLES_FINANCES)
  async pdf(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Res() res: Response) {
    const facture = await this.service.findOne(user.ecoleId, id);
    const pdf = await genererFacturePdf({
      numero: facture.id,
      ecoleNom: facture.ecole.nom,
      eleveNom: facture.eleve.nom,
      eleprenom: facture.eleve.prenom,
      eleveMatricule: facture.eleve.matricule,
      libelle: facture.libelle,
      montantTotal: Number(facture.montantTotal),
      montantPaye: Number(facture.montantPaye),
      statut: facture.statut,
      dateEmission: facture.createdAt,
      dateEcheance: facture.dateEcheance,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="facture-${id}.pdf"` });
    res.send(pdf);
  }
}
