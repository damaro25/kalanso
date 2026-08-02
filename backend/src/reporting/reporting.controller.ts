import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { ReportingService } from './reporting.service';
import { ExportService } from './export.service';

@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private reportingService: ReportingService,
    private exportService: ExportService,
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayloadUser) {
    return this.reportingService.dashboard(user.ecoleId);
  }

  @Get('export/eleves.xlsx')
  async exportEleves(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.elevesXlsx(user.ecoleId, classeId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="eleves.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/impayes.xlsx')
  async exportImpayes(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.impayesXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="impayes.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/factures.xlsx')
  async exportFactures(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.facturesXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="factures.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/factures-modele.xlsx')
  async exportFacturesModele(@Res() res: Response) {
    const buffer = await this.exportService.factureModeleXlsx();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-factures.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/paie-modele.xlsx')
  async exportPaieModele(@Res() res: Response) {
    const buffer = await this.exportService.paieModeleXlsx();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-paie.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/bulletin/:eleveId.xlsx')
  async exportBulletin(
    @CurrentUser() user: JwtPayloadUser,
    @Param('eleveId') eleveId: string,
    @Query('trimestre') trimestre: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.bulletinXlsx(user.ecoleId, eleveId, Number(trimestre ?? 1));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="bulletin-${eleveId}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/bulletin/:eleveId.pdf')
  async exportBulletinPdf(
    @CurrentUser() user: JwtPayloadUser,
    @Param('eleveId') eleveId: string,
    @Query('trimestre') trimestre: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.bulletinPdf(user.ecoleId, eleveId, Number(trimestre ?? 1));
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bulletin-${eleveId}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('export/appel.xlsx')
  async exportAppel(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Query('date') date: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.appelXlsx(user.ecoleId, classeId, date);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="appel-${classeId}-${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/inventaire.xlsx')
  async exportInventaire(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.inventaireXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="inventaire.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/bulletin-paie/:id.pdf')
  async exportBulletinPaiePdf(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.bulletinPaiePdf(user.ecoleId, id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="bulletin-paie-${id}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('export/cahier-paie.xlsx')
  async exportCahierPaie(
    @CurrentUser() user: JwtPayloadUser,
    @Query('mois') mois: string,
    @Query('annee') annee: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.cahierPaieXlsx(user.ecoleId, Number(mois), Number(annee));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="cahier-paie-${mois}-${annee}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/emploi-du-temps.xlsx')
  async exportEmploiDuTempsXlsx(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.emploiDuTempsXlsx(user.ecoleId, classeId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="emploi-du-temps-${classeId}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/emploi-du-temps.pdf')
  async exportEmploiDuTempsPdf(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.emploiDuTempsPdf(user.ecoleId, classeId);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="emploi-du-temps-${classeId}.pdf"`,
    });
    res.send(buffer);
  }

  @Get('export/notes-classe.xlsx')
  async exportNotesClasse(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Query('trimestre') trimestre: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.notesClasseXlsx(user.ecoleId, classeId, Number(trimestre ?? 1));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="notes-${classeId}-T${trimestre}.xlsx"`,
    });
    res.send(buffer);
  }
}
