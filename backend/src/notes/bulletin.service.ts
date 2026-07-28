import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export function calculerMoyenne(notes: { valeur: number; coefficient: number }[]): number {
  const totalCoefficient = notes.reduce((acc, n) => acc + n.coefficient, 0);
  if (totalCoefficient === 0) return 0;
  const totalPoints = notes.reduce((acc, n) => acc + n.valeur * n.coefficient, 0);
  return totalPoints / totalCoefficient;
}

// Barème sur 10 (plafond des notes Kalanso) : mêmes seuils que l'ancien /20, divisés par 2.
export function mention(moyenne: number): string {
  if (moyenne >= 8) return 'Très Bien';
  if (moyenne >= 7) return 'Bien';
  if (moyenne >= 6) return 'Assez Bien';
  if (moyenne >= 5) return 'Passable';
  return 'Insuffisant';
}

@Injectable()
export class BulletinService {
  constructor(private prisma: PrismaService) {}

  async calculer(ecoleId: string, eleveId: string, trimestre: number) {
    const eleve = await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });

    const inscription = await this.prisma.inscription.findFirst({
      where: { eleveId, ecoleId, statut: 'EN_COURS' },
      include: { classe: { include: { niveau: true } }, anneeScolaire: true },
    });
    if (!inscription) {
      throw new BadRequestException("Cet élève n'a pas d'inscription en cours");
    }

    const notesEleve = await this.prisma.note.findMany({
      where: { ecoleId, eleveId, trimestre, anneeScolaireId: inscription.anneeScolaireId },
      include: { matiere: true },
      orderBy: { matiere: { nom: 'asc' } },
    });

    const moyenneGenerale = calculerMoyenne(
      notesEleve.map((n) => ({ valeur: Number(n.valeur), coefficient: Number(n.matiere.coefficient) })),
    );

    const inscriptionsClasse = await this.prisma.inscription.findMany({
      where: { classeId: inscription.classeId, ecoleId, statut: 'EN_COURS' },
    });

    const moyennesClasse = await Promise.all(
      inscriptionsClasse.map(async (i) => {
        const notes = await this.prisma.note.findMany({
          where: { ecoleId, eleveId: i.eleveId, trimestre, anneeScolaireId: inscription.anneeScolaireId },
          include: { matiere: true },
        });
        return {
          eleveId: i.eleveId,
          moyenne: calculerMoyenne(notes.map((n) => ({ valeur: Number(n.valeur), coefficient: Number(n.matiere.coefficient) }))),
        };
      }),
    );

    const classement = moyennesClasse.sort((a, b) => b.moyenne - a.moyenne);
    const rang = classement.findIndex((m) => m.eleveId === eleveId) + 1;

    return {
      eleve,
      classe: inscription.classe,
      anneeScolaire: inscription.anneeScolaire,
      trimestre,
      notes: notesEleve.map((n) => ({
        matiere: n.matiere.nom,
        coefficient: Number(n.matiere.coefficient),
        valeur: Number(n.valeur),
        appreciation: n.appreciation,
      })),
      moyenneGenerale,
      mention: mention(moyenneGenerale),
      rang,
      effectifClasse: classement.length,
    };
  }
}
