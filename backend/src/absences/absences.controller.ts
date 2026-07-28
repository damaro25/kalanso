import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { AbsencesService } from './absences.service';
import { CreateAppelDto } from './dto/appel.dto';

@Controller('absences')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AbsencesController {
  constructor(private service: AbsencesService) {}

  @Post('appel')
  enregistrerAppel(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateAppelDto) {
    return this.service.enregistrerAppel(user.ecoleId, dto, user.userId);
  }

  @Get()
  findByClasseAndDate(
    @CurrentUser() user: JwtPayloadUser,
    @Query('classeId') classeId: string,
    @Query('date') date: string,
  ) {
    return this.service.findByClasseAndDate(user.ecoleId, classeId, date);
  }

  @Get('eleve/:id')
  findByEleve(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findByEleve(user.ecoleId, id);
  }

  @Get('stats')
  stats(@CurrentUser() user: JwtPayloadUser, @Query('classeId') classeId?: string) {
    return this.service.stats(user.ecoleId, classeId);
  }
}
