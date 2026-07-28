import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommunicationService } from '../communication/communication.service';
import { CreateAppelDto } from './dto/appel.dto';

@Injectable()
export class AbsencesService {
  constructor(
    private prisma: PrismaService,
    private communication: CommunicationService,
  ) {}

  async enregistrerAppel(ecoleId: string, dto: CreateAppelDto, saisieParId: string) {
    const classe = await this.prisma.classe.findFirstOrThrow({ where: { id: dto.classeId, ecoleId } });

    // Un élève ne peut être marqué que dans la classe où il est réellement
    // inscrit : sans ce contrôle, un appel soumis avec un effectif périmé (ex.
    // onglet resté ouvert après un transfert de classe) crée une absence
    // rattachée à la mauvaise classe — et comme l'upsert ci-dessous ne
    // touche pas classeId sur une ligne déjà existante, un appel correctement
    // soumis ensuite pour la bonne classe ne suffit pas à la corriger.
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
        `${horsClasse.length} élève(s) de l'appel ne sont pas inscrit(s) dans cette classe pour son année scolaire — rechargez la page`,
      );
    }

    const date = new Date(dto.date);

    // On ne notifie que les élèves qui n'étaient pas déjà marqués absents
    // pour cette date, afin d'éviter les SMS en double si l'appel est re-soumis.
    const absencesExistantes = await this.prisma.absence.findMany({
      where: { eleveId: { in: dto.entries.map((e) => e.eleveId) }, date },
    });
    const statutExistant = new Map(absencesExistantes.map((a) => [a.eleveId, a.statut]));

    const operations = dto.entries.map((entry) =>
      this.prisma.absence.upsert({
        where: { eleveId_date: { eleveId: entry.eleveId, date } },
        update: {
          statut: entry.statut,
          motif: entry.motif,
          saisieParId,
          classeId: dto.classeId,
          anneeScolaireId: classe.anneeScolaireId,
        },
        create: {
          ecoleId,
          eleveId: entry.eleveId,
          classeId: dto.classeId,
          anneeScolaireId: classe.anneeScolaireId,
          date,
          statut: entry.statut,
          motif: entry.motif,
          saisieParId,
        },
      }),
    );

    const resultat = await this.prisma.$transaction(operations);

    const nouveauxAbsents = dto.entries.filter(
      (entry) => entry.statut === 'ABSENT' && statutExistant.get(entry.eleveId) !== 'ABSENT',
    );
    for (const entry of nouveauxAbsents) {
      await this.communication.notifierAbsence(ecoleId, entry.eleveId, date);
    }

    return resultat;
  }

  async findByClasseAndDate(ecoleId: string, classeId: string, date: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    return this.prisma.absence.findMany({
      where: { ecoleId, classeId, date: new Date(date) },
      include: { eleve: true },
    });
  }

  async findByEleve(ecoleId: string, eleveId: string) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    return this.prisma.absence.findMany({ where: { ecoleId, eleveId }, orderBy: { date: 'desc' } });
  }

  async stats(ecoleId: string, classeId?: string) {
    const absences = await this.prisma.absence.findMany({
      where: { ecoleId, classeId, statut: { in: ['ABSENT', 'RETARD'] } },
      include: { eleve: true },
    });

    const parEleve = new Map<string, { eleveId: string; nom: string; prenom: string; absences: number; retards: number }>();
    for (const a of absences) {
      const entry = parEleve.get(a.eleveId) ?? {
        eleveId: a.eleveId,
        nom: a.eleve.nom,
        prenom: a.eleve.prenom,
        absences: 0,
        retards: 0,
      };
      if (a.statut === 'ABSENT') entry.absences += 1;
      if (a.statut === 'RETARD') entry.retards += 1;
      parEleve.set(a.eleveId, entry);
    }

    return Array.from(parEleve.values());
  }
}
