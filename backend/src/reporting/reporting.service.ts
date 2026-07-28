import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async dashboard(ecoleId: string) {
    const debutMois = new Date();
    debutMois.setDate(1);
    debutMois.setHours(0, 0, 0, 0);

    const aujourdhui = new Date();
    aujourdhui.setHours(0, 0, 0, 0);

    const [totalEleves, totalPersonnel, paiementsDuMois, impayes, absencesDuJour] = await Promise.all([
      this.prisma.eleve.count({ where: { ecoleId, actif: true } }),
      this.prisma.personnel.count({ where: { ecoleId, actif: true } }),
      this.prisma.paiement.aggregate({
        where: { ecoleId, datePaiement: { gte: debutMois } },
        _sum: { montant: true },
        _count: true,
      }),
      this.prisma.facture.findMany({ where: { ecoleId, statut: { in: ['IMPAYEE', 'PARTIELLE'] } } }),
      this.prisma.absence.findMany({ where: { ecoleId, date: aujourdhui } }),
    ]);

    const impayesMontant = impayes.reduce((acc, f) => acc + (Number(f.montantTotal) - Number(f.montantPaye)), 0);

    return {
      totalEleves,
      totalPersonnel,
      paiementsDuMois: {
        montant: Number(paiementsDuMois._sum.montant ?? 0),
        nombre: paiementsDuMois._count,
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
