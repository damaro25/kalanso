import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateNiveauDto, UpdateNiveauDto } from './dto/niveau.dto';

@Injectable()
export class NiveauxService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.niveau.findMany({ where: { ecoleId }, orderBy: { ordre: 'asc' } });
  }

  create(ecoleId: string, dto: CreateNiveauDto) {
    return this.prisma.niveau.create({ data: { ecoleId, ...dto } });
  }

  async update(ecoleId: string, id: string, dto: UpdateNiveauDto) {
    await this.prisma.niveau.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.niveau.update({ where: { id }, data: dto });
  }

  async remove(ecoleId: string, id: string) {
    await this.prisma.niveau.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.niveau.delete({ where: { id } });
  }
}
