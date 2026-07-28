import { Body, Controller, Get, Param, Post, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PaiementsService } from './paiements.service';
import { CreatePaiementDto } from './dto/paiement.dto';
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

  @Get(':id/recu')
  async recu(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string, @Res() res: Response) {
    const paiement = await this.service.findOne(user.ecoleId, id);
    const pdf = await genererRecuPdf({
      numero: paiement.id,
      ecoleNom: paiement.facture.ecole.nom,
      eleveNom: paiement.facture.eleve.nom,
      eleprenom: paiement.facture.eleve.prenom,
      factureLibelle: paiement.facture.libelle,
      montant: Number(paiement.montant),
      mode: paiement.mode,
      datePaiement: paiement.datePaiement,
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="recu-${id}.pdf"` });
    res.send(pdf);
  }
}
