import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { logoEcole } from '../common/pdf/logo.util';

// Routes publiques (sans connexion) : le nom et le logo de l'école, pour la page de connexion, l'en-tête et le
// titre de l'onglet. Aucune autre donnée n'est exposée.
@Controller('ecoles')
export class EcolePubliqueController {
  constructor(private prisma: PrismaService) {}

  @Get('public')
  async publique() {
    const ecole = await this.prisma.ecole.findFirst({
      where: { actif: true },
      orderBy: { createdAt: 'asc' },
      select: { nom: true },
    });
    // Version du logo (empreinte) : l'interface recharge l'image quand le logo change
    const logo = logoEcole();
    return { nom: ecole?.nom ?? null, logoVersion: createHash('sha1').update(logo.buffer).digest('hex').slice(0, 12) };
  }

  @Get('public/logo')
  logo(@Res() res: Response) {
    const logo = logoEcole();
    res.set({ 'Content-Type': logo.mime, 'Cache-Control': 'public, max-age=300' });
    res.send(logo.buffer);
  }
}
