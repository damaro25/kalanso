import { BadRequestException, Body, Controller, Get, Param, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PaiementsService } from './paiements.service';
import { CreatePaiementDto } from './dto/paiement.dto';
import { PayerInscriptionDto } from './dto/payer-inscription.dto';
import { genererRecuPdf } from './recu.util';

const ROLES_FINANCES = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('paiements')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_FINANCES)
export class PaiementsController {
  constructor(private service: PaiementsService) {}

  @Post()
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreatePaiementDto) {
    return this.service.create(user.ecoleId, dto, user.userId);
  }

  // Les élèves inscrits cette année et l'état de leur inscription / réinscription (à payer par défaut)
  @Get('inscriptions')
  inscriptionsAPayer(
    @CurrentUser() user: JwtPayloadUser,
    @Query('niveauId') niveauId?: string,
    @Query('classeId') classeId?: string,
    @Query('etat') etat?: string,
    @Query('type') type?: string,
  ) {
    const etatValide = etat === 'A_PAYER' || etat === 'PAYEE' || etat === 'FRAIS_NON_DEFINIS' || etat === 'TOUS' ? etat : undefined;
    const typeValide = type === 'INSCRIPTION' || type === 'REINSCRIPTION' ? type : undefined;
    return this.service.inscriptionsAPayer(user.ecoleId, {
      niveauId: niveauId || undefined,
      classeId: classeId || undefined,
      type: typeValide,
      etat: etatValide,
    });
  }

  // Ce qu'il reste à payer pour l'inscription / la réinscription de l'élève (année en cours)
  @Get('inscription/:eleveId')
  apercuInscription(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string) {
    return this.service.apercuInscription(user.ecoleId, eleveId);
  }

  // Encaisse l'inscription / la réinscription au montant exact du niveau de la classe
  @Post('inscription/:eleveId')
  payerInscription(
    @CurrentUser() user: JwtPayloadUser,
    @Param('eleveId') eleveId: string,
    @Body() dto: PayerInscriptionDto,
  ) {
    return this.service.payerInscription(user.ecoleId, eleveId, user.userId, dto.mode, dto.type);
  }

  // Choisit inscription ou réinscription avant tout versement : la facture prend le libellé et le montant du type
  @Put('inscription/:eleveId/type')
  changerTypeInscription(
    @CurrentUser() user: JwtPayloadUser,
    @Param('eleveId') eleveId: string,
    @Body() dto: PayerInscriptionDto,
  ) {
    if (!dto.type) throw new BadRequestException("Type d'opération requis");
    return this.service.changerTypeInscription(user.ecoleId, eleveId, dto.type);
  }

  @Get(':id/recu')
  async recu(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Res() res: Response) {
    const pdf = await genererRecuPdf(await this.service.donneesRecu(user.ecoleId, id));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recu-${id}.pdf"` });
    res.send(pdf);
  }
}
