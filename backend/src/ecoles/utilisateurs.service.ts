import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUtilisateurDto, UpdateUtilisateurDto } from './dto/utilisateur.dto';

const SELECTION_PUBLIQUE = { id: true, nom: true, prenom: true, email: true, role: true, actif: true, createdAt: true };

@Injectable()
export class UtilisateursService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.utilisateur.findMany({
      where: { ecoleId },
      select: SELECTION_PUBLIQUE,
      orderBy: { nom: 'asc' },
    });
  }

  async create(ecoleId: string, dto: CreateUtilisateurDto) {
    const emailExistant = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (emailExistant) {
      throw new BadRequestException('Un compte existe déjà avec cet email');
    }
    const motDePasseHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.utilisateur.create({
      data: {
        ecoleId,
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        motDePasseHash,
        role: dto.role,
        personnelId: dto.personnelId,
      },
      select: SELECTION_PUBLIQUE,
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateUtilisateurDto, demandeurId: string) {
    const utilisateur = await this.prisma.utilisateur.findFirst({ where: { id, ecoleId } });
    if (!utilisateur) {
      throw new NotFoundException('Compte introuvable');
    }
    if (dto.actif === false && id === demandeurId) {
      throw new ForbiddenException('Impossible de désactiver votre propre compte');
    }

    const motDePasseHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    return this.prisma.utilisateur.update({
      where: { id },
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        role: dto.role,
        actif: dto.actif,
        ...(motDePasseHash ? { motDePasseHash } : {}),
      },
      select: SELECTION_PUBLIQUE,
    });
  }
}
