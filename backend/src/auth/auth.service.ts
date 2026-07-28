import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string) {
    const utilisateur = await this.prisma.utilisateur.findUnique({ where: { email } });
    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    const motDePasseValide = await bcrypt.compare(password, utilisateur.motDePasseHash);
    if (!motDePasseValide) {
      throw new UnauthorizedException('Identifiants invalides');
    }

    await this.prisma.utilisateur.update({
      where: { id: utilisateur.id },
      data: { dernierLoginAt: new Date() },
    });

    const payload = {
      userId: utilisateur.id,
      ecoleId: utilisateur.ecoleId,
      role: utilisateur.role,
      email: utilisateur.email,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: utilisateur.id,
        nom: utilisateur.nom,
        prenom: utilisateur.prenom,
        email: utilisateur.email,
        role: utilisateur.role,
        ecoleId: utilisateur.ecoleId,
      },
    };
  }
}
