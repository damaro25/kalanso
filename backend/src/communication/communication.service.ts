import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SmsProvider } from './sms.service';
import { TypeMessage } from '../generated/prisma/enums';

interface DestinataireParent {
  parentTuteurId: string;
  telephone: string;
}

@Injectable()
export class CommunicationService {
  private readonly logger = new Logger('Communication');

  constructor(
    private prisma: PrismaService,
    private sms: SmsProvider,
  ) {}

  journal(ecoleId: string) {
    return this.prisma.messageParent.findMany({
      where: { ecoleId },
      include: { eleve: true, parentTuteur: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
  }

  private async destinatairesEleve(eleveId: string): Promise<DestinataireParent[]> {
    const liens = await this.prisma.eleveParent.findMany({
      where: { eleveId },
      include: { parentTuteur: true },
      orderBy: { contactPrincipal: 'desc' },
    });

    return liens
      .filter((lien) => lien.parentTuteur.telephone)
      .map((lien) => ({
        parentTuteurId: lien.parentTuteurId,
        telephone: lien.parentTuteur.telephone!,
      }));
  }

  private async envoyerA(
    ecoleId: string,
    eleveId: string,
    destinataires: DestinataireParent[],
    contenu: string,
    type: TypeMessage,
    envoyeParId?: string,
  ) {
    const messages: Awaited<ReturnType<typeof this.prisma.messageParent.update>>[] = [];
    for (const destinataire of destinataires) {
      const message = await this.prisma.messageParent.create({
        data: {
          ecoleId,
          eleveId,
          parentTuteurId: destinataire.parentTuteurId,
          telephone: destinataire.telephone,
          contenu,
          type,
          envoyeParId,
        },
      });

      let statut: 'ENVOYE' | 'ECHEC' = 'ECHEC';
      try {
        const ok = await this.sms.envoyer(destinataire.telephone, contenu);
        statut = ok ? 'ENVOYE' : 'ECHEC';
      } catch (erreur) {
        this.logger.error(`Échec d'envoi SMS vers ${destinataire.telephone}`, erreur);
      }

      messages.push(await this.prisma.messageParent.update({ where: { id: message.id }, data: { statut } }));
    }
    return messages;
  }

  async envoyerMessageEleve(ecoleId: string, eleveId: string, contenu: string, envoyeParId: string) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    const destinataires = await this.destinatairesEleve(eleveId);
    if (destinataires.length === 0) {
      throw new BadRequestException("Cet élève n'a aucun parent avec un numéro de téléphone");
    }
    return this.envoyerA(ecoleId, eleveId, destinataires, contenu, 'MANUEL', envoyeParId);
  }

  async envoyerMessageClasse(ecoleId: string, classeId: string, contenu: string, envoyeParId: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, classeId, statut: 'EN_COURS' },
    });

    let envoyes = 0;
    let sansContact = 0;
    for (const inscription of inscriptions) {
      const destinataires = await this.destinatairesEleve(inscription.eleveId);
      if (destinataires.length === 0) {
        sansContact += 1;
        continue;
      }
      const messages = await this.envoyerA(ecoleId, inscription.eleveId, destinataires, contenu, 'MANUEL', envoyeParId);
      envoyes += messages.length;
    }

    return { envoyes, elevesSansContact: sansContact };
  }

  /**
   * Notification automatique déclenchée par l'appel journalier.
   * Silencieuse si l'élève n'a aucun parent joignable.
   */
  async notifierAbsence(ecoleId: string, eleveId: string, date: Date) {
    const eleve = await this.prisma.eleve.findFirst({ where: { id: eleveId, ecoleId } });
    if (!eleve) return;

    const destinataires = await this.destinatairesEleve(eleveId);
    if (destinataires.length === 0) return;

    const contenu = `Kalanso : votre enfant ${eleve.prenom} ${eleve.nom} a été marqué(e) absent(e) le ${date.toLocaleDateString('fr-FR')}. Merci de contacter l'école.`;
    await this.envoyerA(ecoleId, eleveId, destinataires, contenu, 'ABSENCE');
  }

  async rappelImpaye(ecoleId: string, factureId: string, envoyeParId: string) {
    const facture = await this.prisma.facture.findFirstOrThrow({
      where: { id: factureId, ecoleId },
      include: { eleve: true },
    });

    const reste = Number(facture.montantTotal) - Number(facture.montantPaye);
    if (reste <= 0) {
      throw new BadRequestException('Cette facture est déjà soldée');
    }

    const destinataires = await this.destinatairesEleve(facture.eleveId);
    if (destinataires.length === 0) {
      throw new BadRequestException("Cet élève n'a aucun parent avec un numéro de téléphone");
    }

    const contenu = `Kalanso : rappel de paiement pour ${facture.eleve.prenom} ${facture.eleve.nom} — ${facture.libelle} : reste à payer ${reste.toLocaleString('fr-FR')} GNF. Merci de régulariser auprès de l'école.`;
    return this.envoyerA(ecoleId, facture.eleveId, destinataires, contenu, 'RAPPEL_IMPAYE', envoyeParId);
  }
}
