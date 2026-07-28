import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MobileMoneyProvider } from './mobile-money-provider';
import { InitierTransactionDto } from './dto/initier-transaction.dto';
import { StatutFacture } from '../generated/prisma/enums';

@Injectable()
export class MobileMoneyService {
  constructor(
    private prisma: PrismaService,
    private provider: MobileMoneyProvider,
  ) {}

  journal(ecoleId: string) {
    return this.prisma.transactionMobileMoney.findMany({
      where: { ecoleId },
      include: { facture: { include: { eleve: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  async initier(ecoleId: string, dto: InitierTransactionDto, initieeParId: string) {
    const facture = await this.prisma.facture.findFirstOrThrow({ where: { id: dto.factureId, ecoleId } });

    const reste = Number(facture.montantTotal) - Number(facture.montantPaye);
    if (reste <= 0) {
      throw new BadRequestException('Cette facture est déjà soldée');
    }
    if (dto.montant > reste) {
      throw new BadRequestException(
        `Le montant dépasse le reste à payer (${reste.toLocaleString('fr-FR')} GNF)`,
      );
    }

    const { reference } = await this.provider.initier(dto.operateur, dto.telephone, dto.montant);

    return this.prisma.transactionMobileMoney.create({
      data: {
        ecoleId,
        factureId: facture.id,
        operateur: dto.operateur,
        telephone: dto.telephone,
        montant: dto.montant,
        reference,
        initieeParId,
      },
      include: { facture: { include: { eleve: true } } },
    });
  }

  /**
   * Confirmation de la transaction. Dans un vrai déploiement, cette étape serait
   * déclenchée par le webhook/callback de l'opérateur ; ici elle est appelée
   * manuellement (simulation). Crée le paiement et met à jour la facture.
   */
  async confirmer(ecoleId: string, transactionId: string) {
    const transaction = await this.prisma.transactionMobileMoney.findFirst({
      where: { id: transactionId, ecoleId },
      include: { facture: true },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction introuvable');
    }
    if (transaction.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette transaction a déjà été traitée');
    }

    const facture = transaction.facture;
    const montant = Number(transaction.montant);
    const nouveauMontantPaye = Number(facture.montantPaye) + montant;
    if (nouveauMontantPaye > Number(facture.montantTotal)) {
      throw new BadRequestException('Le montant payé dépasserait le montant total de la facture');
    }

    const nouveauStatut: StatutFacture =
      nouveauMontantPaye >= Number(facture.montantTotal) ? 'PAYEE' : 'PARTIELLE';

    const [paiement] = await this.prisma.$transaction([
      this.prisma.paiement.create({
        data: {
          ecoleId,
          factureId: facture.id,
          montant,
          mode: 'MOBILE_MONEY',
          reference: transaction.reference,
        },
      }),
      this.prisma.facture.update({
        where: { id: facture.id },
        data: { montantPaye: nouveauMontantPaye, statut: nouveauStatut },
      }),
    ]);

    return this.prisma.transactionMobileMoney.update({
      where: { id: transaction.id },
      data: { statut: 'REUSSIE', paiementId: paiement.id },
      include: { facture: { include: { eleve: true } }, paiement: true },
    });
  }

  async marquerEchec(ecoleId: string, transactionId: string) {
    const transaction = await this.prisma.transactionMobileMoney.findFirst({
      where: { id: transactionId, ecoleId },
    });
    if (!transaction) {
      throw new NotFoundException('Transaction introuvable');
    }
    if (transaction.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette transaction a déjà été traitée');
    }
    return this.prisma.transactionMobileMoney.update({
      where: { id: transaction.id },
      data: { statut: 'ECHOUEE' },
    });
  }
}
