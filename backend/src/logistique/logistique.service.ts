import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterielDto, UpdateMaterielDto } from './dto/materiel.dto';

@Injectable()
export class LogistiqueService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string, filtres: { categorie?: string; etat?: string; salleId?: string }) {
    return this.prisma.materiel.findMany({
      where: {
        ecoleId,
        categorie: filtres.categorie as any,
        etat: filtres.etat as any,
        salleId: filtres.salleId,
      },
      include: { salle: true },
      orderBy: [{ categorie: 'asc' }, { designation: 'asc' }],
    });
  }

  async resume(ecoleId: string) {
    const materiels = await this.prisma.materiel.findMany({ where: { ecoleId } });
    const totalArticles = materiels.reduce((acc, m) => acc + m.quantite, 0);
    const parEtat: Record<string, number> = {};
    for (const m of materiels) {
      parEtat[m.etat] = (parEtat[m.etat] ?? 0) + m.quantite;
    }
    return { nombreReferences: materiels.length, totalArticles, parEtat };
  }

  async create(ecoleId: string, dto: CreateMaterielDto) {
    if (dto.salleId) {
      const salle = await this.prisma.salle.findFirst({ where: { id: dto.salleId, ecoleId } });
      if (!salle) throw new BadRequestException('Salle invalide');
    }
    return this.prisma.materiel.create({
      data: {
        ecoleId,
        categorie: dto.categorie,
        designation: dto.designation,
        quantite: dto.quantite,
        etat: dto.etat ?? 'BON',
        salleId: dto.salleId,
        description: dto.description,
      },
      include: { salle: true },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateMaterielDto) {
    const materiel = await this.prisma.materiel.findFirst({ where: { id, ecoleId } });
    if (!materiel) throw new NotFoundException('Matériel introuvable');
    if (dto.salleId) {
      const salle = await this.prisma.salle.findFirst({ where: { id: dto.salleId, ecoleId } });
      if (!salle) throw new BadRequestException('Salle invalide');
    }
    return this.prisma.materiel.update({
      where: { id },
      data: {
        categorie: dto.categorie,
        designation: dto.designation,
        quantite: dto.quantite,
        etat: dto.etat,
        salleId: dto.salleId,
        description: dto.description,
      },
      include: { salle: true },
    });
  }

  async remove(ecoleId: string, id: string) {
    const materiel = await this.prisma.materiel.findFirst({ where: { id, ecoleId } });
    if (!materiel) throw new NotFoundException('Matériel introuvable');
    return this.prisma.materiel.delete({ where: { id } });
  }
}
