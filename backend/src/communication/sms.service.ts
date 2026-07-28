import { Injectable, Logger } from '@nestjs/common';

/**
 * Interface d'envoi de SMS. L'implémentation simulée journalise l'envoi.
 * Pour brancher un vrai fournisseur (Orange Guinée, Twilio...), il suffit de
 * remplacer SmsSimuleService par une implémentation qui appelle son API,
 * sans toucher au reste du module.
 */
export abstract class SmsProvider {
  abstract envoyer(telephone: string, contenu: string): Promise<boolean>;
}

@Injectable()
export class SmsSimuleService extends SmsProvider {
  private readonly logger = new Logger('SmsSimule');

  async envoyer(telephone: string, contenu: string): Promise<boolean> {
    this.logger.log(`[SIMULATION] SMS vers ${telephone} : ${contenu}`);
    return true;
  }
}
