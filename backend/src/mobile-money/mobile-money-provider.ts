import { Injectable, Logger } from '@nestjs/common';
import { OperateurMobileMoney } from '../generated/prisma/enums';

export interface ResultatInitiation {
  reference: string;
}

/**
 * Interface d'un fournisseur Mobile Money. L'implémentation simulée journalise
 * les appels et attribue une référence. Pour brancher les vraies API Orange Money
 * ou MTN MoMo (compte marchand + clés API requis), il suffit de remplacer
 * MobileMoneySimuleService par une implémentation par opérateur, sans toucher
 * au reste du module.
 */
export abstract class MobileMoneyProvider {
  abstract initier(operateur: OperateurMobileMoney, telephone: string, montant: number): Promise<ResultatInitiation>;
}

@Injectable()
export class MobileMoneySimuleService extends MobileMoneyProvider {
  private readonly logger = new Logger('MobileMoneySimule');

  async initier(operateur: OperateurMobileMoney, telephone: string, montant: number): Promise<ResultatInitiation> {
    const prefixe = operateur === 'ORANGE_MONEY' ? 'OM' : 'MTN';
    const reference = `${prefixe}-${Date.now()}-${Math.floor(Math.random() * 10000)
      .toString()
      .padStart(4, '0')}`;
    this.logger.log(
      `[SIMULATION] Demande de paiement ${operateur} envoyée au ${telephone} pour ${montant} GNF (réf ${reference})`,
    );
    return { reference };
  }
}
