import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET as string,
    });
  }

  // Le jeton ne sert qu'à identifier la personne : école, rôle et statut sont relus en base à chaque
  // requête. Une session déjà ouverte reste donc juste quand l'école ou le rôle change (un jeton
  // gardait sinon l'ancienne valeur pendant des heures), et un compte désactivé ou supprimé est
  // refusé tout de suite, sans attendre l'expiration du jeton.
  async validate(payload: JwtPayloadUser): Promise<JwtPayloadUser> {
    const utilisateur = await this.prisma.utilisateur.findUnique({
      where: { id: payload.userId },
      select: { id: true, ecoleId: true, role: true, email: true, actif: true, personnelId: true },
    });
    if (!utilisateur || !utilisateur.actif) {
      throw new UnauthorizedException('Session expirée, reconnectez-vous');
    }
    return {
      userId: utilisateur.id,
      ecoleId: utilisateur.ecoleId,
      role: utilisateur.role,
      email: utilisateur.email,
      personnelId: utilisateur.personnelId,
    };
  }
}
