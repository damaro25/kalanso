import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  private async resoudreAnnee(ecoleId: string) {
    const courante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (courante) return courante;
    // à défaut, la plus récente
    const derniere = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
    if (!derniere) throw new BadRequestException('Aucune année scolaire définie');
    return derniere;
  }

  async dashboard(ecoleId: string) {
    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    const anneeCourante = await this.resoudreAnnee(ecoleId);

    const [totalEleves, totalPersonnel, facturesInscription, impayes, absencesDuJour] = await Promise.all([
      this.prisma.inscription.count({ where: { ecoleId, anneeScolaireId: anneeCourante.id, statut: 'EN_COURS' } }),
      this.prisma.personnel.count({ where: { ecoleId, actif: true } }),
      this.prisma.facture.findMany({
        where: { ecoleId, anneeScolaireId: anneeCourante.id, type: 'INSCRIPTION', statut: { not: 'ANNULEE' } },
        select: { montantPaye: true },
      }),
      this.prisma.facture.findMany({
        where: { ecoleId, anneeScolaireId: anneeCourante.id, statut: { in: ['IMPAYEE', 'PARTIELLE'] } },
      }),
      this.prisma.absence.findMany({ where: { ecoleId, date: aujourdhui } }),
    ]);

    const fraisInscriptionEncaisse = facturesInscription.reduce((acc, f) => acc + Number(f.montantPaye), 0);
    const impayesMontant = impayes.reduce((acc, f) => acc + (Number(f.montantTotal) - Number(f.montantPaye)), 0);

    return {
      anneeScolaire: { id: anneeCourante.id, libelle: anneeCourante.libelle },
      totalEleves,
      totalPersonnel,
      fraisInscription: {
        encaisse: fraisInscriptionEncaisse,
      },
      impayes: {
        nombre: impayes.length,
        montant: impayesMontant,
      },
      absencesAujourdhui: {
        absents: absencesDuJour.filter((a) => a.statut === 'ABSENT').length,
        retards: absencesDuJour.filter((a) => a.statut === 'RETARD').length,
        presents: absencesDuJour.filter((a) => a.statut === 'PRESENT').length,
      },
    };
  }
}
