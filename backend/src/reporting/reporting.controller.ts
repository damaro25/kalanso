import { BadRequestException, Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PerimetreService } from '../common/perimetre/perimetre.service';
import { ReportingService } from './reporting.service';
import { ExportService } from './export.service';

// Mêmes rôles que les pages et les API d'origine : les exports ne doivent pas ouvrir ce que l'API de base ferme.
export const ROLES_EXPORT_FINANCE: RoleUtilisateur[] = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];
export const ROLES_EXPORT_DIRECTION: RoleUtilisateur[] = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT];

@Controller('reporting')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ReportingController {
  constructor(
    private reportingService: ReportingService,
    private exportService: ExportService,
    private perimetre: PerimetreService,
  ) {}

  // Les effectifs et les absences sont pour tous ; les montants (frais d'inscription encaissés, impayés) restent
  // réservés aux mêmes rôles que l'API /finance : on les retire de la réponse pour les autres.
  @Get('dashboard')
  async dashboard(@CurrentUser() user: JwtPayloadUser) {
    // Un enseignant ne voit que les effectifs et les absences de ses classes.
    const donnees = await this.reportingService.dashboard(user.ecoleId, await this.perimetre.classesAutorisees(user));
    if (ROLES_EXPORT_FINANCE.includes(user.role as RoleUtilisateur)) return donnees;
    const { fraisInscription: _fraisInscription, impayes: _impayes, ...sansMontants } = donnees;
    return sansMontants;
  }

  @Get('export/eleves.xlsx')
  async exportEleves(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string | undefined,
    @Res() res: Response,
  ) {
    if (classeId) await this.perimetre.exigerClasse(user, classeId);
    const buffer = await this.exportService.elevesXlsx(user.ecoleId, classeId, await this.perimetre.classesAutorisees(user));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="eleves.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/impayes.xlsx')
  @Roles(...ROLES_EXPORT_FINANCE)
  async exportImpayes(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.impayesXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="impayes.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/factures.xlsx')
  @Roles(...ROLES_EXPORT_FINANCE)
  async exportFactures(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.facturesXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="factures.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/factures-modele.xlsx')
  @Roles(...ROLES_EXPORT_FINANCE)
  async exportFacturesModele(@Res() res: Response) {
    const buffer = await this.exportService.factureModeleXlsx();
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="modele-import-factures.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/paie-modele.xlsx')
  @Roles(...ROLES_EXPORT_FINANCE)
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
    await this.perimetre.exigerEleve(user, eleveId);
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
    await this.perimetre.exigerEleve(user, eleveId);
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
    await this.perimetre.exigerClasse(user, classeId);
    const buffer = await this.exportService.appelXlsx(user.ecoleId, classeId, date);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="appel-${classeId}-${date}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/inventaire.xlsx')
  @Roles(...ROLES_EXPORT_DIRECTION)
  async exportInventaire(@CurrentUser() user: JwtPayloadUser, @Res() res: Response) {
    const buffer = await this.exportService.inventaireXlsx(user.ecoleId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="inventaire.xlsx"',
    });
    res.send(buffer);
  }

  @Get('export/bulletin-paie/:id.pdf')
  @Roles(...ROLES_EXPORT_FINANCE)
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
  @Roles(...ROLES_EXPORT_FINANCE)
  async exportCahierPaie(
    @CurrentUser() user: JwtPayloadUser,
    @Query('mois') mois: string,
    @Query('annee') annee: string,
    @Res() res: Response,
  ) {
    const moisNum = Number(mois);
    const anneeNum = Number(annee);
    if (!Number.isInteger(moisNum) || moisNum < 1 || moisNum > 12 || !Number.isInteger(anneeNum) || anneeNum < 2000 || anneeNum > 2100) {
      throw new BadRequestException('Mois (1 à 12) et année (ex. 2026) obligatoires pour le cahier de paie.');
    }
    const buffer = await this.exportService.cahierPaieXlsx(user.ecoleId, moisNum, anneeNum);
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
    await this.perimetre.exigerClasse(user, classeId);
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
    await this.perimetre.exigerClasse(user, classeId);
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
    await this.perimetre.exigerClasse(user, classeId);
    const buffer = await this.exportService.notesClasseXlsx(user.ecoleId, classeId, Number(trimestre ?? 1));
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="notes-${classeId}-T${trimestre}.xlsx"`,
    });
    res.send(buffer);
  }

  @Get('export/parcours-classe.xlsx')
  @Roles(...ROLES_EXPORT_DIRECTION)
  async exportParcoursClasse(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.parcoursClasseXlsx(user.ecoleId, classeId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="parcours-${classeId}.xlsx"`,
    });
    res.send(buffer);
  }
}
