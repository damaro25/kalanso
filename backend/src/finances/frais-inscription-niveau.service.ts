import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFraisInscriptionNiveauDto, UpdateFraisInscriptionNiveauDto } from './dto/frais-inscription-niveau.dto';

@Injectable()
export class FraisInscriptionNiveauService {
  constructor(private prisma: PrismaService) {}

  // anneeScolaireId est un simple champ (pas de relation Prisma) sur ce modèle :
  // on rattache nous-mêmes le libellé de l'année pour l'affichage.
  async findAll(ecoleId: string) {
    const [frais, annees] = await Promise.all([
      this.prisma.fraisInscriptionNiveau.findMany({
        where: { ecoleId },
        include: { niveau: true },
        orderBy: { niveau: { ordre: 'asc' } },
      }),
      this.prisma.anneeScolaire.findMany({ where: { ecoleId } }),
    ]);
    const anneeParId = new Map(annees.map((a) => [a.id, a]));
    return frais.map((f) => ({ ...f, anneeScolaire: anneeParId.get(f.anneeScolaireId) ?? null }));
  }

  async create(ecoleId: string, dto: CreateFraisInscriptionNiveauDto) {
    const existant = await this.prisma.fraisInscriptionNiveau.findFirst({
      where: { ecoleId, niveauId: dto.niveauId, anneeScolaireId: dto.anneeScolaireId },
    });
    if (existant) {
      throw new BadRequestException('Un montant est déjà défini pour ce niveau sur cette année scolaire');
    }
    return this.prisma.fraisInscriptionNiveau.create({
      data: {
        ecoleId,
        niveauId: dto.niveauId,
        anneeScolaireId: dto.anneeScolaireId,
        montant: dto.montant,
      },
      include: { niveau: true },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateFraisInscriptionNiveauDto) {
    const actuel = await this.prisma.fraisInscriptionNiveau.findFirstOrThrow({ where: { id, ecoleId } });

    if (dto.anneeScolaireId && dto.anneeScolaireId !== actuel.anneeScolaireId) {
      const conflit = await this.prisma.fraisInscriptionNiveau.findFirst({
        where: { ecoleId, niveauId: actuel.niveauId, anneeScolaireId: dto.anneeScolaireId },
      });
      if (conflit) {
        throw new BadRequestException('Un montant est déjà défini pour ce niveau sur cette année scolaire');
      }
    }

    return this.prisma.fraisInscriptionNiveau.update({
      where: { id },
      data: { montant: dto.montant, anneeScolaireId: dto.anneeScolaireId },
      include: { niveau: true },
    });
  }
}
