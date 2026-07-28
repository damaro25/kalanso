import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { MobileMoneyService } from './mobile-money.service';
import { InitierTransactionDto } from './dto/initier-transaction.dto';

const ROLES_FINANCES = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('mobile-money')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_FINANCES)
export class MobileMoneyController {
  constructor(private service: MobileMoneyService) {}

  @Get('transactions')
  journal(@CurrentUser() user: JwtPayloadUser) {
    return this.service.journal(user.ecoleId);
  }

  @Post('transactions')
  initier(@CurrentUser() user: JwtPayloadUser, @Body() dto: InitierTransactionDto) {
    return this.service.initier(user.ecoleId, dto, user.userId);
  }

  @Post('transactions/:id/confirmer')
  confirmer(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.confirmer(user.ecoleId, id);
  }

  @Post('transactions/:id/echec')
  marquerEchec(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.marquerEchec(user.ecoleId, id);
  }
}
