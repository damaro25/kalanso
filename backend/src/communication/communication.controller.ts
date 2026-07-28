import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { CommunicationService } from './communication.service';
import { EnvoyerMessageDto } from './dto/message.dto';

const ROLES_COMMUNICATION = [
  RoleUtilisateur.FONDATEUR,
  RoleUtilisateur.CHEF_ETABLISSEMENT,
  RoleUtilisateur.SECRETAIRE,
];

@Controller('communication')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CommunicationController {
  constructor(private service: CommunicationService) {}

  @Get('messages')
  @Roles(...ROLES_COMMUNICATION, RoleUtilisateur.COMPTABLE)
  journal(@CurrentUser() user: JwtPayloadUser) {
    return this.service.journal(user.ecoleId);
  }

  @Post('messages')
  @Roles(...ROLES_COMMUNICATION)
  envoyer(@CurrentUser() user: JwtPayloadUser, @Body() dto: EnvoyerMessageDto) {
    if (dto.eleveId) {
      return this.service.envoyerMessageEleve(user.ecoleId, dto.eleveId, dto.contenu, user.userId);
    }
    if (dto.classeId) {
      return this.service.envoyerMessageClasse(user.ecoleId, dto.classeId, dto.contenu, user.userId);
    }
    throw new BadRequestException('Précisez un élève (eleveId) ou une classe (classeId)');
  }

  @Post('rappel-impaye/:factureId')
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE)
  rappelImpaye(@CurrentUser() user: JwtPayloadUser, @Param('factureId') factureId: string) {
    return this.service.rappelImpaye(user.ecoleId, factureId, user.userId);
  }
}
