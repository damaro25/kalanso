import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTarifEcolageDto, UpdateTarifEcolageDto } from './dto/tarif-ecolage.dto';

@Injectable()
export class TarifsEcolageService {
  constructor(private prisma: PrismaService) {}

  // anneeScolaireId est un simple champ (pas de relation Prisma) sur ce modèle :
  // on rattache nous-mêmes le libellé de l'année pour l'affichage.
  async findAll(ecoleId: string) {
    const [tarifs, annees] = await Promise.all([
      this.prisma.tarifEcolage.findMany({ where: { ecoleId }, include: { niveau: true } }),
      this.prisma.anneeScolaire.findMany({ where: { ecoleId } }),
    ]);
    const anneeParId = new Map(annees.map((a) => [a.id, a]));
    return tarifs.map((t) => ({ ...t, anneeScolaire: anneeParId.get(t.anneeScolaireId) ?? null }));
  }

  create(ecoleId: string, dto: CreateTarifEcolageDto) {
    return this.prisma.tarifEcolage.create({
      data: {
        ecoleId,
        niveauId: dto.niveauId,
        anneeScolaireId: dto.anneeScolaireId,
        libelle: dto.libelle,
        montant: dto.montant,
      },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateTarifEcolageDto) {
    await this.prisma.tarifEcolage.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.tarifEcolage.update({
      where: { id },
      data: dto,
      include: { niveau: true },
    });
  }
}
