import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SaisirNotesDto } from './dto/note.dto';

@Injectable()
export class NotesService {
  constructor(private prisma: PrismaService) {}

  async saisir(ecoleId: string, dto: SaisirNotesDto) {
    const classe = await this.prisma.classe.findFirstOrThrow({ where: { id: dto.classeId, ecoleId } });

    // Deux garde-fous, sur le même principe que l'appel des absences : sans
    // eux, une note peut être rattachée à un élève qui n'est pas dans cette
    // classe, ou à une matière d'un autre niveau — et comme l'upsert ne
    // touchait pas classeId sur une ligne déjà existante, une note mal
    // rattachée restait bloquée sur la mauvaise classe même après une
    // ressaisie correcte.
    const inscriptions = await this.prisma.inscription.findMany({
      where: {
        ecoleId,
        classeId: dto.classeId,
        anneeScolaireId: classe.anneeScolaireId,
        statut: 'EN_COURS',
        eleveId: { in: dto.entries.map((e) => e.eleveId) },
      },
    });
    const inscrits = new Set(inscriptions.map((i) => i.eleveId));
    const horsClasse = dto.entries.filter((e) => !inscrits.has(e.eleveId));
    if (horsClasse.length > 0) {
      throw new BadRequestException(
        `${horsClasse.length} élève(s) ne sont pas inscrit(s) dans cette classe pour son année scolaire — rechargez la page`,
      );
    }

    const matieres = await this.prisma.matiere.findMany({
      where: { ecoleId, id: { in: dto.entries.map((e) => e.matiereId) } },
    });
    const matiereParId = new Map(matieres.map((m) => [m.id, m]));
    const matiereInvalide = dto.entries.find((e) => matiereParId.get(e.matiereId)?.niveauId !== classe.niveauId);
    if (matiereInvalide) {
      throw new BadRequestException("Une matière ne correspond pas au niveau de cette classe");
    }

    const operations = dto.entries.map((entry) =>
      this.prisma.note.upsert({
        where: {
          eleveId_matiereId_anneeScolaireId_trimestre: {
            eleveId: entry.eleveId,
            matiereId: entry.matiereId,
            anneeScolaireId: classe.anneeScolaireId,
            trimestre: dto.trimestre,
          },
        },
        update: { valeur: entry.valeur, appreciation: entry.appreciation, classeId: dto.classeId },
        create: {
          ecoleId,
          eleveId: entry.eleveId,
          classeId: dto.classeId,
          matiereId: entry.matiereId,
          anneeScolaireId: classe.anneeScolaireId,
          trimestre: dto.trimestre,
          valeur: entry.valeur,
          appreciation: entry.appreciation,
        },
      }),
    );

    return this.prisma.$transaction(operations);
  }

  async findByClasseTrimestre(ecoleId: string, classeId: string, trimestre: number) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    return this.prisma.note.findMany({
      where: { ecoleId, classeId, trimestre },
      include: { matiere: true, eleve: true },
    });
  }
}
