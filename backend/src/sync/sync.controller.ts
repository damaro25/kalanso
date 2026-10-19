import { BadRequestException, Body, Controller, Get, Post, Put, Query, UseGuards } from '@nestjs/common';
import { IsArray, IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { SyncService } from './sync.service';
import type { Changement } from './sync-moteur';

class ConfigSyncDto {
  @IsOptional() @IsString() urlServeur?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() motDePasse?: string;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() bdHote?: string;
  @IsOptional() @Type(() => Number) @IsInt() bdPort?: number | null;
  @IsOptional() @IsString() bdNom?: string;
  @IsOptional() @IsString() bdUtilisateur?: string;
  @IsOptional() @IsString() bdMotDePasse?: string;
}

class PosteDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() code?: string;
}

class RecevoirDto {
  @IsString() poste: string;
  @Type(() => Number) @IsInt() @Min(0) curseur: number;
  @IsArray() changements: Changement[];
}

// Rôles qui peuvent servir de compte de synchronisation (côté serveur)
const ROLES_SYNC = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE, RoleUtilisateur.COMPTABLE];

@Controller('sync')
@UseGuards(JwtAuthGuard, RolesGuard)
export class SyncController {
  constructor(
    private service: SyncService,
    private prisma: PrismaService,
  ) {}

  // ── Version bureau : réglages (fondateur seulement) ──

  @Get('config')
  @Roles(RoleUtilisateur.FONDATEUR)
  config() {
    return this.service.lireConfig();
  }

  @Put('config')
  @Roles(RoleUtilisateur.FONDATEUR)
  enregistrer(@Body() dto: ConfigSyncDto) {
    return this.service.enregistrerConfig(dto);
  }

  @Post('tester')
  @Roles(RoleUtilisateur.FONDATEUR)
  tester() {
    return this.service.tester();
  }

  @Post('tester-base')
  @Roles(RoleUtilisateur.FONDATEUR)
  testerBase() {
    return this.service.testerBase();
  }

  @Post('maintenant')
  @Roles(RoleUtilisateur.FONDATEUR)
  maintenant() {
    return this.service.synchroniser();
  }

  // ── Serveur : appelé par les PC bureau ──

  @Get('serveur')
  @Roles(...ROLES_SYNC)
  async serveur(@CurrentUser() user: JwtPayloadUser) {
    const ecole = await this.prisma.ecole.findUnique({ where: { id: user.ecoleId }, select: { nom: true } });
    return { ok: true, ecole: ecole?.nom ?? null };
  }

  @Post('postes')
  @Roles(...ROLES_SYNC)
  postes(@CurrentUser() user: JwtPayloadUser, @Body() dto: PosteDto) {
    return this.service.enregistrerPoste(user.ecoleId, dto.nom, dto.code);
  }

  @Post('recevoir')
  @Roles(...ROLES_SYNC)
  recevoir(@CurrentUser() user: JwtPayloadUser, @Body() dto: RecevoirDto) {
    return this.service.recevoir(user.ecoleId, dto.poste, dto.curseur, dto.changements);
  }

  @Get('envoyer')
  @Roles(...ROLES_SYNC)
  envoyer(@CurrentUser() user: JwtPayloadUser, @Query('poste') poste: string, @Query('curseur') curseur: string) {
    if (!poste) throw new BadRequestException('Poste requis');
    return this.service.envoyer(user.ecoleId, poste, Math.max(0, Number(curseur) || 0));
  }
}
