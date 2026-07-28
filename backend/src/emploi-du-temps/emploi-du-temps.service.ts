import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCreneauDto } from './dto/creneau.dto';

// Les heures au format "HH:MM" se comparent lexicographiquement.
function chevauche(debutA: string, finA: string, debutB: string, finB: string): boolean {
  return debutA < finB && finA > debutB;
}

@Injectable()
export class EmploiDuTempsService {
  constructor(private prisma: PrismaService) {}

  async findByClasse(ecoleId: string, classeId: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    return this.prisma.creneau.findMany({
      where: { ecoleId, classeId },
      include: { matiere: true, personnel: true, salle: true },
      orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    });
  }

  async findByPersonnel(ecoleId: string, personnelId: string) {
    await this.prisma.personnel.findFirstOrThrow({ where: { id: personnelId, ecoleId } });
    return this.prisma.creneau.findMany({
      where: { ecoleId, personnelId },
      include: { matiere: true, classe: true, salle: true },
      orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
    });
  }

  async create(ecoleId: string, dto: CreateCreneauDto) {
    if (dto.heureFin <= dto.heureDebut) {
      throw new BadRequestException("L'heure de fin doit être après l'heure de début");
    }

    const classe = await this.prisma.classe.findFirstOrThrow({ where: { id: dto.classeId, ecoleId } });
    const matiere = await this.prisma.matiere.findFirstOrThrow({ where: { id: dto.matiereId, ecoleId } });
    if (matiere.niveauId !== classe.niveauId) {
      throw new BadRequestException("Cette matière n'appartient pas au niveau de la classe");
    }
    if (dto.personnelId) {
      const personnel = await this.prisma.personnel.findFirst({ where: { id: dto.personnelId, ecoleId } });
      if (!personnel) {
        throw new NotFoundException('Personnel introuvable');
      }
      if (!personnel.actif) {
        throw new BadRequestException("Ce membre du personnel n'est plus actif et ne peut pas être affecté à un créneau");
      }
    }
    if (dto.salleId) {
      await this.prisma.salle.findFirstOrThrow({ where: { id: dto.salleId, ecoleId } });
    }

    // Contraintes, uniquement sur le même jour et un intervalle qui se chevauche :
    // - une salle ne peut pas être réservée deux fois
    // - un enseignant ne peut pas donner deux cours en même temps, même dans des salles différentes
    if (dto.salleId || dto.personnelId) {
      const creneauxExistants = await this.prisma.creneau.findMany({
        where: {
          ecoleId,
          jour: dto.jour,
          anneeScolaireId: classe.anneeScolaireId,
          OR: [
            ...(dto.salleId ? [{ salleId: dto.salleId }] : []),
            ...(dto.personnelId ? [{ personnelId: dto.personnelId }] : []),
          ],
        },
        include: { classe: true, salle: true },
      });

      for (const existant of creneauxExistants) {
        if (!chevauche(dto.heureDebut, dto.heureFin, existant.heureDebut, existant.heureFin)) continue;

        if (dto.salleId && existant.salleId === dto.salleId) {
          throw new BadRequestException(
            `Conflit : la salle ${existant.salle?.nom} est déjà occupée par ${existant.classe.nom} de ${existant.heureDebut} à ${existant.heureFin} ce jour-là`,
          );
        }
        if (dto.personnelId && existant.personnelId === dto.personnelId) {
          throw new BadRequestException(
            `Conflit : l'enseignant est déjà occupé avec ${existant.classe.nom} de ${existant.heureDebut} à ${existant.heureFin} ce jour-là`,
          );
        }
      }
    }

    return this.prisma.creneau.create({
      data: {
        ecoleId,
        classeId: dto.classeId,
        matiereId: dto.matiereId,
        personnelId: dto.personnelId,
        salleId: dto.salleId,
        anneeScolaireId: classe.anneeScolaireId,
        jour: dto.jour,
        heureDebut: dto.heureDebut,
        heureFin: dto.heureFin,
        tauxHoraire: dto.tauxHoraire,
      },
      include: { matiere: true, personnel: true, salle: true },
    });
  }

  async remove(ecoleId: string, id: string) {
    const creneau = await this.prisma.creneau.findFirst({ where: { id, ecoleId } });
    if (!creneau) {
      throw new NotFoundException('Créneau introuvable');
    }
    return this.prisma.creneau.delete({ where: { id } });
  }
}
