import { BadRequestException, Injectable } from '@nestjs/common';
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

  // niveauId / anneeScolaireId sont de simples champs (pas de relation Prisma) :
  // rien en base n'empêche d'y mettre l'id d'une autre école. On vérifie nous-mêmes.
  private async verifierReferences(ecoleId: string, niveauId?: string, anneeScolaireId?: string) {
    if (niveauId) {
      const niveau = await this.prisma.niveau.findFirst({ where: { id: niveauId, ecoleId } });
      if (!niveau) throw new BadRequestException('Niveau invalide');
    }
    if (anneeScolaireId) {
      const annee = await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } });
      if (!annee) throw new BadRequestException('Année scolaire invalide');
    }
  }

  async create(ecoleId: string, dto: CreateTarifEcolageDto) {
    await this.verifierReferences(ecoleId, dto.niveauId, dto.anneeScolaireId);
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
    await this.verifierReferences(ecoleId, undefined, dto.anneeScolaireId);
    return this.prisma.tarifEcolage.update({
      where: { id },
      data: dto,
      include: { niveau: true },
    });
  }
}
