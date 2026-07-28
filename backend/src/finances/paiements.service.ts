import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaiementDto } from './dto/paiement.dto';
import { StatutFacture } from '../generated/prisma/enums';

@Injectable()
export class PaiementsService {
  constructor(private prisma: PrismaService) {}

  async create(ecoleId: string, dto: CreatePaiementDto, saisieParId: string) {
    const facture = await this.prisma.facture.findFirstOrThrow({ where: { id: dto.factureId, ecoleId } });

    const nouveauMontantPaye = Number(facture.montantPaye) + dto.montant;
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
          montant: dto.montant,
          mode: dto.mode,
          reference: dto.reference,
          saisieParId,
        },
      }),
      this.prisma.facture.update({
        where: { id: facture.id },
        data: { montantPaye: nouveauMontantPaye, statut: nouveauStatut },
      }),
    ]);

    return paiement;
  }

  async findOne(ecoleId: string, id: string) {
    return this.prisma.paiement.findFirstOrThrow({
      where: { id, ecoleId },
      include: { facture: { include: { eleve: true, ecole: true } } },
    });
  }
}
