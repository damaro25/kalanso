import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from '../finances/factures.service';
import { calculerMoyenne } from '../notes/bulletin.service';
import { ValiderPassageDto } from './dto/parcours.dto';

// Barème de passage : moyenne annuelle >= 5/10 (les notes Kalanso sont plafonnées à 10).
export const SEUIL_PASSAGE = 5;

export type Decision = 'ADMIS' | 'REDOUBLE' | 'INDETERMINEE';

function decider(moyenneAnnuelle: number | null): Decision {
  if (moyenneAnnuelle === null) return 'INDETERMINEE';
  return moyenneAnnuelle >= SEUIL_PASSAGE ? 'ADMIS' : 'REDOUBLE';
}

@Injectable()
export class ParcoursService {
  constructor(
    private prisma: PrismaService,
    private facturesService: FacturesService,
  ) {}

  async parcoursClasse(ecoleId: string, classeId: string) {
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, ecoleId },
      include: { niveau: true, anneeScolaire: true },
    });
    if (!classe) {
      throw new NotFoundException('Classe introuvable');
    }

    const inscriptions = await this.prisma.inscription.findMany({
      where: { classeId, ecoleId, statut: 'EN_COURS' },
      include: { eleve: true },
      orderBy: { eleve: { nom: 'asc' } },
    });

    const parcours = await Promise.all(
      inscriptions.map(async (inscription) => {
        const moyennesTrimestre: (number | null)[] = [];
        for (let trimestre = 1; trimestre <= 3; trimestre++) {
          const notes = await this.prisma.note.findMany({
            where: {
              ecoleId,
              eleveId: inscription.eleveId,
              trimestre,
              anneeScolaireId: classe.anneeScolaireId,
            },
            include: { matiere: true },
          });
          moyennesTrimestre.push(
            notes.length === 0
              ? null
              : calculerMoyenne(notes.map((n) => ({ valeur: Number(n.valeur), coefficient: Number(n.matiere.coefficient) }))),
          );
        }

        const trimestresRenseignes = moyennesTrimestre.filter((m): m is number => m !== null);
        const moyenneAnnuelle =
          trimestresRenseignes.length === 0
            ? null
            : trimestresRenseignes.reduce((acc, m) => acc + m, 0) / trimestresRenseignes.length;

        return {
          eleve: inscription.eleve,
          moyenneTrimestre1: moyennesTrimestre[0],
          moyenneTrimestre2: moyennesTrimestre[1],
          moyenneTrimestre3: moyennesTrimestre[2],
          moyenneAnnuelle,
          decision: decider(moyenneAnnuelle),
        };
      }),
    );

    return {
      classe,
      seuilPassage: SEUIL_PASSAGE,
      parcours,
    };
  }

  async classesDestination(ecoleId: string, classeId: string) {
    const classe = await this.prisma.classe.findFirst({
      where: { id: classeId, ecoleId },
      include: { niveau: true },
    });
    if (!classe) {
      throw new NotFoundException('Classe introuvable');
    }

    const niveauSuperieur = await this.prisma.niveau.findFirst({
      where: { ecoleId, ordre: classe.niveau.ordre + 1 },
    });

    const classesDisponibles = await this.prisma.classe.findMany({
      where: {
        ecoleId,
        actif: true,
        anneeScolaireId: { not: classe.anneeScolaireId },
        niveauId: niveauSuperieur ? { in: [classe.niveauId, niveauSuperieur.id] } : classe.niveauId,
      },
      include: { niveau: true, anneeScolaire: true },
      orderBy: [{ anneeScolaire: { dateDebut: 'desc' } }, { nom: 'asc' }],
    });

    return {
      niveauActuel: classe.niveau,
      niveauSuperieur,
      classesDisponibles,
    };
  }

  async validerPassage(ecoleId: string, dto: ValiderPassageDto) {
    const reussies: string[] = [];
    const echecs: { eleveId: string; erreur: string }[] = [];

    for (const entry of dto.entries) {
      try {
        const classeDestination = await this.prisma.classe.findFirst({
          where: { id: entry.classeDestinationId, ecoleId },
        });
        if (!classeDestination) {
          throw new BadRequestException('Classe de destination invalide');
        }

        const inscriptionActuelle = await this.prisma.inscription.findFirst({
          where: { eleveId: entry.eleveId, ecoleId, statut: 'EN_COURS' },
        });
        if (!inscriptionActuelle) {
          throw new BadRequestException("Cet élève n'a pas d'inscription en cours");
        }

        const dejaInscrit = await this.prisma.inscription.findUnique({
          where: {
            eleveId_anneeScolaireId: {
              eleveId: entry.eleveId,
              anneeScolaireId: classeDestination.anneeScolaireId,
            },
          },
        });
        if (dejaInscrit) {
          throw new BadRequestException('Cet élève a déjà une inscription pour cette année scolaire');
        }

        await this.prisma.$transaction([
          this.prisma.inscription.update({
            where: { id: inscriptionActuelle.id },
            data: { statut: 'TERMINEE' },
          }),
          this.prisma.inscription.create({
            data: {
              ecoleId,
              eleveId: entry.eleveId,
              classeId: classeDestination.id,
              anneeScolaireId: classeDestination.anneeScolaireId,
            },
          }),
        ]);

        await this.facturesService.genererFacturesEnrolement(
          ecoleId,
          entry.eleveId,
          classeDestination.id,
          classeDestination.anneeScolaireId,
        );

        reussies.push(entry.eleveId);
      } catch (error) {
        echecs.push({ eleveId: entry.eleveId, erreur: error instanceof Error ? error.message : 'Erreur inconnue' });
      }
    }

    return { reussies: reussies.length, echecs };
  }
}
