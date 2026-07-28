import { Body, Controller, Delete, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
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
  ) {}

  @Get('dashboard')
  dashboard(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.dashboard(user.ecoleId, anneeScolaireId);
  }

  @Get('recettes-par-mois')
  recettesParMois(@CurrentUser() user: JwtPayloadUser, @Query('annee') annee?: string) {
    return this.service.recettesParMois(user.ecoleId, Number(annee ?? new Date().getFullYear()));
  }

  @Get('salaires-par-mois')
  salairesParMois(@CurrentUser() user: JwtPayloadUser, @Query('annee') annee?: string) {
    return this.service.salairesParMois(user.ecoleId, Number(annee ?? new Date().getFullYear()));
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

  @Get('compte-resultat-par-mois')
  compteResultatParMois(@CurrentUser() user: JwtPayloadUser, @Query('annee') annee?: string) {
    return this.service.compteResultatParMois(user.ecoleId, Number(annee ?? new Date().getFullYear()));
  }

  @Get('mouvements')
  listMouvements(
    @CurrentUser() user: JwtPayloadUser,
    @Query('annee') annee?: string,
    @Query('type') type?: string,
  ) {
    const t = type === 'RECETTE' || type === 'DEPENSE' ? type : undefined;
    return this.service.listMouvements(user.ecoleId, annee ? Number(annee) : undefined, t);
  }

  @Post('mouvements')
  creerMouvement(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateMouvementDto) {
    return this.service.creerMouvement(user.ecoleId, dto, user.userId);
  }

  @Delete('mouvements/:id')
  supprimerMouvement(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.supprimerMouvement(user.ecoleId, id);
  }

  @Post('regenerer-factures')
  regenererFactures(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.facturesService.regenererFacturesManquantes(user.ecoleId, anneeScolaireId);
  }

  @Get('export/bilan.xlsx')
  async exportBilan(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId: string | undefined,
    @Query('annee') annee: string | undefined,
    @Res() res: Response,
  ) {
    const buffer = await this.exportService.bilanXlsx(
      user.ecoleId,
      anneeScolaireId,
      Number(annee ?? new Date().getFullYear()),
    );
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="bilan-financier.xlsx"',
    });
    res.send(buffer);
  }
}
