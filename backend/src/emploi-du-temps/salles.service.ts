import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSalleDto } from './dto/salle.dto';

@Injectable()
export class SallesService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.salle.findMany({ where: { ecoleId }, orderBy: { nom: 'asc' } });
  }

  create(ecoleId: string, dto: CreateSalleDto) {
    return this.prisma.salle.create({ data: { ecoleId, nom: dto.nom, capacite: dto.capacite } });
  }
}
