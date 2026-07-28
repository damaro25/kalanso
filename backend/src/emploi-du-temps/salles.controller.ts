import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { SallesService } from './salles.service';
import { CreateSalleDto } from './dto/salle.dto';

@Controller('salles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SallesController {
  constructor(private service: SallesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayloadUser) {
    return this.service.findAll(user.ecoleId);
  }

  @Post()
  @Roles(RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT)
  create(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateSalleDto) {
    return this.service.create(user.ecoleId, dto);
  }
}
