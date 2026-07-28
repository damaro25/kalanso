import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from '../finances/factures.service';
import {
  AccepterDemandeDto,
  CreateDemandeDto,
  InscriptionDirecteDto,
  RefuserDemandeDto,
} from './dto/demande.dto';

@Injectable()
export class AdmissionsService {
  constructor(
    private prisma: PrismaService,
    private facturesService: FacturesService,
  ) {}

  // Public : soumission d'une demande par un parent, sans authentification.
  async creerDemande(dto: CreateDemandeDto) {
    const ecole = await this.prisma.ecole.findFirst({ where: { id: dto.ecoleId, actif: true } });
    if (!ecole) {
      throw new NotFoundException('École introuvable');
    }

    if (dto.niveauId) {
      const niveau = await this.prisma.niveau.findFirst({ where: { id: dto.niveauId, ecoleId: dto.ecoleId } });
      if (!niveau) {
        throw new BadRequestException('Niveau invalide pour cette école');
      }
    }

    return this.prisma.demandeInscription.create({
      data: {
        ecoleId: dto.ecoleId,
        nomEleve: dto.nomEleve,
        prenomEleve: dto.prenomEleve,
        genre: dto.genre,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
        lieuNaissance: dto.lieuNaissance,
        niveauId: dto.niveauId,
        niveauSouhaite: dto.niveauSouhaite,
        nomParent: dto.nomParent,
        prenomParent: dto.prenomParent,
        telephoneParent: dto.telephoneParent,
        emailParent: dto.emailParent,
        piecesJointes: dto.piecesJointes,
      },
    });
  }

  // Public : infos non sensibles d'une école pour afficher le formulaire.
  async ecolePublique(ecoleId: string) {
    const ecole = await this.prisma.ecole.findFirst({
      where: { id: ecoleId, actif: true },
      select: { id: true, nom: true, ville: true },
    });
    if (!ecole) {
      throw new NotFoundException('École introuvable');
    }
    const niveaux = await this.prisma.niveau.findMany({
      where: { ecoleId },
      select: { id: true, nom: true },
      orderBy: { ordre: 'asc' },
    });
    return { ...ecole, niveaux };
  }

  findAll(ecoleId: string, statut?: string) {
    return this.prisma.demandeInscription.findMany({
      where: { ecoleId, statut: statut as any },
      include: { niveau: true, documents: { orderBy: { createdAt: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async accepter(ecoleId: string, id: string, dto: AccepterDemandeDto, traiteeParId: string) {
    const demande = await this.prisma.demandeInscription.findFirst({ where: { id, ecoleId } });
    if (!demande) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }

    const classe = await this.prisma.classe.findFirst({ where: { id: dto.classeId, ecoleId } });
    if (!classe) {
      throw new BadRequestException('Classe invalide');
    }

    const resultat = await this.prisma.$transaction(async (tx) => {
      const eleve = await tx.eleve.create({
        data: {
          ecoleId,
          matricule: dto.matricule,
          nom: demande.nomEleve,
          prenom: demande.prenomEleve,
          genre: demande.genre,
          dateNaissance: demande.dateNaissance,
          lieuNaissance: demande.lieuNaissance,
        },
      });

      const parent = await tx.parentTuteur.create({
        data: {
          ecoleId,
          nom: demande.nomParent,
          prenom: demande.prenomParent,
          telephone: demande.telephoneParent,
          email: demande.emailParent,
        },
      });

      await tx.eleveParent.create({
        data: {
          eleveId: eleve.id,
          parentTuteurId: parent.id,
          lien: 'Parent',
          contactPrincipal: true,
        },
      });

      await tx.inscription.create({
        data: {
          ecoleId,
          eleveId: eleve.id,
          classeId: dto.classeId,
          anneeScolaireId: classe.anneeScolaireId,
        },
      });

      const demandeMaj = await tx.demandeInscription.update({
        where: { id },
        data: { statut: 'ACCEPTEE', eleveId: eleve.id, traiteeParId },
      });

      return { demande: demandeMaj, eleve };
    });

    await this.facturesService.genererFacturesEnrolement(ecoleId, resultat.eleve.id, dto.classeId, classe.anneeScolaireId);

    return resultat;
  }

  // Authentifié : le secrétariat saisit un élève reçu au bureau. Se comporte
  // comme la soumission publique (demande EN_ATTENTE, pièces jointes possibles) :
  // l'élève n'est créé qu'à l'acceptation de la demande, comme toute admission.
  async inscrireSurPlace(ecoleId: string, dto: InscriptionDirecteDto) {
    return this.prisma.demandeInscription.create({
      data: {
        ecoleId,
        nomEleve: dto.nomEleve,
        prenomEleve: dto.prenomEleve,
        genre: dto.genre,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
        lieuNaissance: dto.lieuNaissance,
        niveauSouhaite: dto.niveauSouhaite,
        nomParent: dto.nomParent,
        prenomParent: dto.prenomParent,
        telephoneParent: dto.telephoneParent,
        emailParent: dto.emailParent,
      },
    });
  }

  async refuser(ecoleId: string, id: string, dto: RefuserDemandeDto, traiteeParId: string) {
    const demande = await this.prisma.demandeInscription.findFirst({ where: { id, ecoleId } });
    if (!demande) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette demande a déjà été traitée');
    }

    return this.prisma.demandeInscription.update({
      where: { id },
      data: { statut: 'REFUSEE', motifRefus: dto.motifRefus, traiteeParId },
    });
  }

  // Annule une admission déjà acceptée : supprime définitivement l'élève créé
  // (et tout ce qui en dépend — inscriptions, factures/paiements, notes,
  // absences...) et remet la demande en attente pour qu'elle puisse être
  // retraitée (acceptée à nouveau, éventuellement dans une autre classe, ou
  // refusée). Action irréversible.
  async annuler(ecoleId: string, id: string, annuleeParId: string) {
    const demande = await this.prisma.demandeInscription.findFirst({ where: { id, ecoleId } });
    if (!demande) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'ACCEPTEE' || !demande.eleveId) {
      throw new BadRequestException("Cette demande n'a pas été acceptée");
    }
    const eleveId = demande.eleveId;

    await this.prisma.$transaction(async (tx) => {
      const liensParents = await tx.eleveParent.findMany({ where: { eleveId } });

      // Décompte avant suppression : c'est la seule trace qui subsistera de ce
      // qui a été perdu, une fois l'élève supprimé.
      const [nbFactures, nbNotes, nbAbsences, nbEmprunts] = await Promise.all([
        tx.facture.count({ where: { eleveId } }),
        tx.note.count({ where: { eleveId } }),
        tx.absence.count({ where: { eleveId } }),
        tx.emprunt.count({ where: { eleveId } }),
      ]);
      const detail = `${nbFactures} facture(s), ${nbNotes} note(s), ${nbAbsences} absence(s), ${nbEmprunts} emprunt(s) supprimés`;

      await tx.transactionMobileMoney.deleteMany({ where: { facture: { eleveId } } });
      await tx.paiement.deleteMany({ where: { facture: { eleveId } } });
      await tx.facture.deleteMany({ where: { eleveId } });
      await tx.note.deleteMany({ where: { eleveId } });
      await tx.absence.deleteMany({ where: { eleveId } });
      await tx.emprunt.deleteMany({ where: { eleveId } });
      await tx.messageParent.deleteMany({ where: { eleveId } });
      await tx.eleveParent.deleteMany({ where: { eleveId } });
      await tx.inscription.deleteMany({ where: { eleveId } });

      // Le(s) parent(s) créé(s) pour cette admission sont supprimés eux aussi,
      // sauf s'ils restent liés à un autre élève (ex: fratrie).
      for (const lien of liensParents) {
        const autreLien = await tx.eleveParent.findFirst({ where: { parentTuteurId: lien.parentTuteurId } });
        if (!autreLien) {
          await tx.messageParent.deleteMany({ where: { parentTuteurId: lien.parentTuteurId } });
          await tx.parentTuteur.delete({ where: { id: lien.parentTuteurId } });
        }
      }
      // D'autres demandes pourraient référencer ce même élève (rare) : on les détache
      // avant de le supprimer, sans quoi la clé étrangère bloquerait la suppression.
      await tx.demandeInscription.updateMany({
        where: { eleveId, NOT: { id } },
        data: { eleveId: null },
      });

      await tx.demandeInscription.update({
        where: { id },
        data: { statut: 'EN_ATTENTE', eleveId: null, motifRefus: null, traiteeParId: null },
      });

      await tx.eleve.delete({ where: { id: eleveId } });

      await tx.annulationAdmission.create({
        data: {
          ecoleId,
          demandeId: id,
          type: 'ADMISSION',
          nomEleve: demande.nomEleve,
          prenomEleve: demande.prenomEleve,
          detail,
          annuleeParId,
        },
      });
    });

    return { annulee: true };
  }

  // Annule un refus : remet la demande en attente pour qu'elle soit retraitée.
  // Contrairement à l'annulation d'une admission acceptée, rien n'a été créé
  // au refus — c'est un simple changement de statut, sans perte de données.
  async annulerRefus(ecoleId: string, id: string, annuleeParId: string) {
    const demande = await this.prisma.demandeInscription.findFirst({ where: { id, ecoleId } });
    if (!demande) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'REFUSEE') {
      throw new BadRequestException("Cette demande n'a pas été refusée");
    }

    return this.prisma.$transaction(async (tx) => {
      const misAJour = await tx.demandeInscription.update({
        where: { id },
        data: { statut: 'EN_ATTENTE', motifRefus: null, traiteeParId: null },
      });

      await tx.annulationAdmission.create({
        data: {
          ecoleId,
          demandeId: id,
          type: 'REFUS',
          nomEleve: demande.nomEleve,
          prenomEleve: demande.prenomEleve,
          detail: demande.motifRefus ? `Motif du refus annulé : ${demande.motifRefus}` : null,
          annuleeParId,
        },
      });

      return misAJour;
    });
  }

  historiqueAnnulations(ecoleId: string) {
    return this.prisma.annulationAdmission.findMany({
      where: { ecoleId },
      orderBy: { createdAt: 'desc' },
    });
  }
}
