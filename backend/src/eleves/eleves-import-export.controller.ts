import {
  BadRequestException,
  Controller,
  Get,
  ParseEnumPipe,
  Post,
  Query,
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
import { Regime, RoleUtilisateur } from '../generated/prisma/enums';
import { ElevesImportExportService } from './eleves-import-export.service';

const ROLES_GESTION = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE];
const TYPE_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const multerOptionsImport = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

// Liste complète des élèves en Excel (identité, classe, régime, contact, père, mère) et import en masse.
// Réservé à la gestion : l'export contient les coordonnées des familles.
@Controller('eleves')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_GESTION)
export class ElevesImportExportController {
  constructor(private service: ElevesImportExportService) {}

  @Get('export.xlsx')
  async exporter(
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
    @Query('classeId') classeId?: string,
    @Query('regime', new ParseEnumPipe(Regime, { optional: true })) regime?: Regime,
  ) {
    const buffer = await this.service.exporter(user.ecoleId, { classeId: classeId || undefined, regime });
    res.set({ 'Content-Type': TYPE_XLSX, 'Content-Disposition': 'attachment; filename="eleves-complet.xlsx"' });
    res.send(buffer);
  }

  @Get('import/modele.xlsx')
  async modele(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.service.modele(user.ecoleId);
    res.set({ 'Content-Type': TYPE_XLSX, 'Content-Disposition': 'attachment; filename="modele-import-eleves.xlsx"' });
    res.send(buffer);
  }

  // Aperçu : ce que l'import ferait, ligne par ligne, sans rien enregistrer.
  @Post('import/apercu')
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  apercu(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.service.apercu(user.ecoleId, fichier.buffer);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  importer(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) throw new BadRequestException('Aucun fichier fourni');
    return this.service.importer(user.ecoleId, fichier.buffer);
  }
}
