import { Body, Controller, Get, Param, ParseEnumPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Min, ValidateIf, ValidateNested } from 'class-validator';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { Regime, RoleUtilisateur } from '../generated/prisma/enums';
import { AssuranceService, type StatutAssurance } from './assurance.service';

class MontantCycleDto {
  @IsString()
  cycle: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  montant: number | null;
}

export class ConfigurationAssuranceDto {
  @IsString()
  anneeScolaireId: string;

  // Montant pour tous les cycles (null : aucun)
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsInt()
  @Min(0)
  tousCycles?: number | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MontantCycleDto)
  parCycle?: MontantCycleDto[];
}

const STATUTS: StatutAssurance[] = ['PAYEE', 'PARTIELLE', 'NON_PAYEE', 'NON_FACTUREE'];
const ROLES_FINANCES = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];

@Controller('assurance')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_FINANCES)
export class AssuranceController {
  constructor(private service: AssuranceService) {}

  @Get('configuration')
  configuration(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.configuration(user.ecoleId, anneeScolaireId || undefined);
  }

  @Put('configuration')
  definirConfiguration(@CurrentUser() user: JwtPayloadUser, @Body() dto: ConfigurationAssuranceDto) {
    return this.service.definirConfiguration(user.ecoleId, dto);
  }

  @Get('suivi')
  suivi(
    @CurrentUser() user: JwtPayloadUser,
    @Query('anneeScolaireId') anneeScolaireId?: string,
    @Query('classeId') classeId?: string,
    @Query('regime', new ParseEnumPipe(Regime, { optional: true })) regime?: Regime,
    @Query('statut') statut?: string,
  ) {
    return this.service.suivi(user.ecoleId, {
      anneeScolaireId: anneeScolaireId || undefined,
      classeId: classeId || undefined,
      regime,
      statut: STATUTS.includes(statut as StatutAssurance) ? (statut as StatutAssurance) : undefined,
    });
  }

  @Get('eleve/:eleveId')
  @Roles(...ROLES_FINANCES, RoleUtilisateur.SECRETAIRE)
  statutEleve(@CurrentUser() user: JwtPayloadUser, @Param('eleveId') eleveId: string) {
    return this.service.statutEleve(user.ecoleId, eleveId);
  }

  // Facture l'assurance aux élèves inscrits qui ne l'ont pas encore (sans doublon)
  @Post('facturer')
  facturer(@CurrentUser() user: JwtPayloadUser, @Query('anneeScolaireId') anneeScolaireId?: string) {
    return this.service.facturer(user.ecoleId, anneeScolaireId || undefined);
  }

  @Get('export.xlsx')
  async exporter(
    @CurrentUser() user: JwtPayloadUser,
    @Res() res: Response,
    @Query('anneeScolaireId') anneeScolaireId?: string,
    @Query('classeId') classeId?: string,
    @Query('regime', new ParseEnumPipe(Regime, { optional: true })) regime?: Regime,
    @Query('statut') statut?: string,
  ) {
    const { buffer, nomFichier } = await this.service.exportXlsx(user.ecoleId, {
      anneeScolaireId: anneeScolaireId || undefined,
      classeId: classeId || undefined,
      regime,
      statut: STATUTS.includes(statut as StatutAssurance) ? (statut as StatutAssurance) : undefined,
    });
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${nomFichier}"`,
    });
    res.send(buffer);
  }
}
