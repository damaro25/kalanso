import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMatiereDto, UpdateMatiereDto } from './dto/matiere.dto';

@Injectable()
export class MatieresService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string, niveauId?: string) {
    return this.prisma.matiere.findMany({
      where: { ecoleId, niveauId },
      include: { niveau: true },
      orderBy: [{ niveau: { ordre: 'asc' } }, { nom: 'asc' }],
    });
  }

  async create(ecoleId: string, dto: CreateMatiereDto) {
    // Rejeu d'une requête hors-ligne déjà passée (réponse perdue en route) :
    // on ne recrée pas la matière, on renvoie celle qui existe déjà.
    if (dto.id) {
      const existante = await this.prisma.matiere.findUnique({ where: { id: dto.id }, include: { niveau: true } });
      if (existante) return existante;
    }
    return this.prisma.matiere.create({
      data: { id: dto.id, ecoleId, niveauId: dto.niveauId, nom: dto.nom, coefficient: dto.coefficient },
      include: { niveau: true },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateMatiereDto) {
    await this.prisma.matiere.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.matiere.update({
      where: { id },
      data: dto,
      include: { niveau: true },
    });
  }

  async remove(ecoleId: string, id: string) {
    await this.prisma.matiere.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.matiere.delete({ where: { id } });
  }
}
