import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUtilisateurDto } from './dto/utilisateur.dto';

@Injectable()
export class UtilisateursService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.utilisateur.findMany({
      where: { ecoleId },
      select: { id: true, nom: true, prenom: true, email: true, role: true, actif: true, createdAt: true },
      orderBy: { nom: 'asc' },
    });
  }

  async create(ecoleId: string, dto: CreateUtilisateurDto) {
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
      select: { id: true, nom: true, prenom: true, email: true, role: true },
    });
  }
}
