import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { FinanceService } from './finance.service';
import { FinanceExportService } from './finance-export.service';
import { CreateMouvementDto } from './dto/mouvement.dto';
import { FacturesService } from '../finances/factures.service';
import { BudgetService } from './budget.service';
import { ClotureService } from './cloture.service';
import { ApercuClotureDto, ExecuterClotureDto } from './dto/cloture.dto';
import { AjouterPosteBudgetDto, ModifierPosteBudgetDto } from './dto/budget.dto';

const ROLES_FINANCE = [
  RoleUtilisateur.FONDATEUR,
  RoleUtilisateur.CHEF_ETABLISSEMENT,
  RoleUtilisateur.COMPTABLE,
];

@Controller('finance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_FINANCE)
export class FinanceController {
  constructor(
    private service: FinanceService,
    private exportService: FinanceExportService,
    private facturesService: FacturesService,
    private budgetService: BudgetService,
    private clotureService: ClotureService,
  ) {}

  // --- Clôture d'année : aperçu (lecture seule), exécution (code de sécurité), historique ---
  @Post('cloture/apercu')
  apercuCloture(@CurrentUser() user: JwtPayloadUser, @Body() dto: ApercuClotureDto) {
    return this.clotureService.apercu(user.ecoleId, dto);
  }

  @Post('cloture/executer')
  executerCloture(@CurrentUser() user: JwtPayloadUser, @Body() dto: ExecuterClotureDto) {
    return this.clotureService.executer(user.ecoleId, dto, user.userId);
  }

  @Get('cloture/historique')
  historiqueClotures(@CurrentUser() user: JwtPayloadUser) {
    return this.clotureService.historique(user.ecoleId);
  }

  // --- Budget de trésorerie (prévisionnel de l'année) ---
  @Get('budget')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  budget(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.budgetService.budget(user.ecoleId, anneeScolaireId || undefined);
  }

  @Post('budget/postes')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  ajouterPosteBudget(@CurrentUser() user: JwtPayloadUser, @Body() dto: AjouterPosteBudgetDto) {
    return this.budgetService.ajouterPoste(user.ecoleId, dto);
  }

  @Post('budget/postes-habituels')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  ajouterPostesHabituels(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.budgetService.ajouterPostesHabituels(user.ecoleId, anneeScolaireId || undefined);
  }

  // Modifier ou supprimer un poste demande le code des dépenses, passé dans un en-tête comme pour les mouvements.
  @Patch('budget/postes/:id')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  modifierPosteBudget(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Body() dto: ModifierPosteBudgetDto,
    @Headers('x-code-suppression') code?: string,
  ) {
    return this.budgetService.modifierPoste(user.ecoleId, id, dto, code);
  }

  @Delete('budget/postes/:id')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  supprimerPosteBudget(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Headers('x-code-suppression') code?: string,
  ) {
    return this.budgetService.supprimerPoste(user.ecoleId, id, code);
  }

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.dashboard(user.ecoleId, anneeScolaireId);
  }

  @Get('recettes-par-mois')
  recettesParMois(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.recettesParMois(user.ecoleId, anneeScolaireId);
  }

  @Get('salaires-par-mois')
  salairesParMois(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.salairesParMois(user.ecoleId, anneeScolaireId);
  }

  @Get('recouvrement-par-classe')
  recouvrementParClasse(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.recouvrementParClasse(user.ecoleId, anneeScolaireId);
  }

  @Get('eleves')
  eleves(
    @CurrentUser() user: JwtPayloadUser,
    @Query('filtre') filtre?: string,
    @Query('anneeScolaireId') anneeScolaireId?: string,
  ) {
    const f = filtre === 'A_JOUR' || filtre === 'EN_RETARD' ? filtre : 'TOUS';
    return this.service.eleves(user.ecoleId, f, anneeScolaireId);
  }

  @Get('statistiques-paiements')
  statistiquesPaiements(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId?: string,
    @Query('niveauId') niveauId?: string,
    @Query('classeId') classeId?: string,
  ) {
    return this.service.statistiquesPaiements(user.ecoleId, {
      anneeScolaireId: anneeScolaireId || undefined,
      niveauId: niveauId || undefined,
      classeId: classeId || undefined,
    });
  }

  // Tableau de bord : paiements par tranche et par genre, pour chaque régime
  @Get('paiements-par-tranche')
  paiementsParTranche(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId?: string,
    @Query('classeId') classeId?: string,
  ) {
    return this.service.paiementsParTranche(user.ecoleId, {
      anneeScolaireId: anneeScolaireId || undefined,
      classeId: classeId || undefined,
    });
  }

  @Get('bordereau-journalier')
  bordereauJournalier(
    @CurrentUser() user: JwtPayloadUser,
    @Query('date') date?: string,
    @Query('niveauId') niveauId?: string,
  ) {
    return this.service.bordereauJournalier(user.ecoleId, { date: date || undefined, niveauId: niveauId || undefined });
  }

  @Get('compte-resultat-par-mois')
  compteResultatParMois(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.compteResultatParMois(user.ecoleId, anneeScolaireId);
  }

  @Get('tresorerie-par-mois')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  tresorerieParMois(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.tresorerieParMois(user.ecoleId, anneeScolaireId);
  }

  @Get('mouvements')
  listMouvements(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId?: string,
    @Query('type') type?: string,
  ) {
    const t = type === 'RECETTE' || type === 'DEPENSE' ? type : undefined;
    return this.service.listMouvements(user.ecoleId, anneeScolaireId, t);
  }

  @Post('mouvements')
  creerMouvement(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateMouvementDto) {
    return this.service.creerMouvement(user.ecoleId, dto, user.userId);
  }

  // Le code de suppression d'une dépense voyage dans un en-tête : il resterait sinon dans les journaux d'accès
  // du serveur web s'il était passé dans l'adresse.
  @Delete('mouvements/:id')
  supprimerMouvement(
    @CurrentUser() user: JwtPayloadUser,
    @Param('id') id: string,
    @Headers('x-code-suppression') code?: string,
  ) {
    return this.service.supprimerMouvement(user.ecoleId, id, code);
  }

  @Post('regenerer-factures')
  regenererFactures(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.facturesService.regenererFacturesManquantes(user.ecoleId, anneeScolaireId);
  }

  @Get('export/bordereau-journalier.xlsx')
  async exportBordereauJournalier(
    @CurrentUser() user: JwtPayloadUser,
    @Query('date') date: string | undefined,
    @Query('niveauId') niveauId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, nomFichier } = await this.exportService.bordereauJournalierXlsx(user.ecoleId, {
      date: date || undefined,
      niveauId: niveauId || undefined,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
    });
    res.send(buffer);
  }

  @Get('export/tresorerie.xlsx')
  @Roles(RoleUtilisateur.FONDATEUR) // Budget et trésorerie : fondateur seulement
  async exportTresorerie(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId: string | undefined,
    @Res() res: Response,
  ) {
    const { buffer, nomFichier } = await this.exportService.tresorerieXlsx(user.ecoleId, anneeScolaireId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
    });
    res.send(buffer);
  }

  @Get('export/bilan.xlsx')
  async exportBilan(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.bilanXlsx(user.ecoleId, anneeScolaireId);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bilan-financier.xlsx"',
    });
    res.send(buffer);
  }
}
