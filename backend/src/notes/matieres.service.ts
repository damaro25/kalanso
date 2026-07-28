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

  create(ecoleId: string, dto: CreateMatiereDto) {
    return this.prisma.matiere.create({
      data: { ecoleId, niveauId: dto.niveauId, nom: dto.nom, coefficient: dto.coefficient },
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
