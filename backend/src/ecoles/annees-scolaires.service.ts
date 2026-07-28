import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnneeScolaireDto, UpdateAnneeScolaireDto } from './dto/annee-scolaire.dto';

@Injectable()
export class AnneesScolairesService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.anneeScolaire.findMany({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
  }

  create(ecoleId: string, dto: CreateAnneeScolaireDto) {
    return this.prisma.anneeScolaire.create({
      data: {
        ecoleId,
        libelle: dto.libelle,
        dateDebut: new Date(dto.dateDebut),
        dateFin: new Date(dto.dateFin),
      },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateAnneeScolaireDto) {
    await this.prisma.anneeScolaire.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.anneeScolaire.update({
      where: { id },
      data: {
        ...dto,
        dateDebut: dto.dateDebut ? new Date(dto.dateDebut) : undefined,
        dateFin: dto.dateFin ? new Date(dto.dateFin) : undefined,
      },
    });
  }

  async activer(ecoleId: string, id: string) {
    await this.prisma.anneeScolaire.findFirstOrThrow({ where: { id, ecoleId } });
    await this.prisma.anneeScolaire.updateMany({ where: { ecoleId }, data: { courante: false } });
    return this.prisma.anneeScolaire.update({ where: { id }, data: { courante: true } });
  }
}
