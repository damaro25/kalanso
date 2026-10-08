import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAnneeScolaireDto, UpdateAnneeScolaireDto } from './dto/annee-scolaire.dto';

// Une année scolaire se note AAAA-AAAA avec deux années consécutives, et ses
// dates doivent être ordonnées : sans ces contrôles, une faute de frappe
// (ex: « 2028-20229 ») entre dans la base et fausse tous les rapports.
function validerAnnee(libelle: string, dateDebut: Date, dateFin: Date) {
  const m = /^(\d{4})-(\d{4})$/.exec(libelle);
  if (!m || Number(m[2]) !== Number(m[1]) + 1) {
    throw new BadRequestException('Le libellé doit être de la forme AAAA-AAAA avec deux années consécutives (ex: 2026-2027)');
  }
  if (dateFin.getTime() <= dateDebut.getTime()) {
    throw new BadRequestException('La date de fin doit être postérieure à la date de début');
  }
}

@Injectable()
export class AnneesScolairesService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.anneeScolaire.findMany({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
  }

  async create(ecoleId: string, dto: CreateAnneeScolaireDto) {
    const dateDebut = new Date(dto.dateDebut);
    const dateFin = new Date(dto.dateFin);
    validerAnnee(dto.libelle, dateDebut, dateFin);

    return this.prisma.anneeScolaire.create({
      data: { ecoleId, libelle: dto.libelle, dateDebut, dateFin },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateAnneeScolaireDto) {
    const existante = await this.prisma.anneeScolaire.findFirstOrThrow({ where: { id, ecoleId } });

    const libelle = dto.libelle ?? existante.libelle;
    const dateDebut = dto.dateDebut ? new Date(dto.dateDebut) : existante.dateDebut;
    const dateFin = dto.dateFin ? new Date(dto.dateFin) : existante.dateFin;
    validerAnnee(libelle, dateDebut, dateFin);

    return this.prisma.anneeScolaire.update({
      where: { id },
      data: {
        libelle: dto.libelle,
        dateDebut: dto.dateDebut ? dateDebut : undefined,
        dateFin: dto.dateFin ? dateFin : undefined,
      },
    });
  }

  async activer(ecoleId: string, id: string) {
    await this.prisma.anneeScolaire.findFirstOrThrow({ where: { id, ecoleId } });
    await this.prisma.anneeScolaire.updateMany({ where: { ecoleId }, data: { courante: false } });
    return this.prisma.anneeScolaire.update({ where: { id }, data: { courante: true } });
  }
}
