import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { existsSync } from 'fs';
import { PrismaService } from '../prisma/prisma.service';
import { TypeDocument } from '../generated/prisma/enums';

export const DOSSIER_UPLOADS = join(process.cwd(), 'uploads', 'admissions');

const TYPES_VALIDES: TypeDocument[] = ['PHOTO', 'ATTESTATION', 'RELEVE_NOTES', 'EXTRAIT_NAISSANCE', 'AUTRE'];

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  // Public : ajout d'un document à une demande existante (par le parent).
  async ajouter(
    demandeId: string,
    type: string,
    fichier: { originalname: string; filename: string; mimetype: string; size: number },
  ) {
    const demande = await this.prisma.demandeInscription.findUnique({ where: { id: demandeId } });
    if (!demande) {
      throw new NotFoundException('Demande introuvable');
    }
    if (demande.statut !== 'EN_ATTENTE') {
      throw new BadRequestException('Cette demande est déjà traitée, ajout de document impossible');
    }
    if (!TYPES_VALIDES.includes(type as TypeDocument)) {
      throw new BadRequestException('Type de document invalide');
    }

    return this.prisma.documentDemande.create({
      data: {
        demandeId,
        type: type as TypeDocument,
        nomFichier: fichier.originalname,
        cheminFichier: fichier.filename,
        mimeType: fichier.mimetype,
        tailleOctets: fichier.size,
      },
    });
  }

  // Direction : récupérer le document pour le téléchargement (scopé à l'école).
  async pourTelechargement(ecoleId: string, documentId: string) {
    const document = await this.prisma.documentDemande.findFirst({
      where: { id: documentId, demande: { ecoleId } },
    });
    if (!document) {
      throw new NotFoundException('Document introuvable');
    }
    const chemin = join(DOSSIER_UPLOADS, document.cheminFichier);
    if (!existsSync(chemin)) {
      throw new NotFoundException('Fichier introuvable sur le serveur');
    }
    return { document, chemin };
  }

  async verifier(ecoleId: string, documentId: string, statut: string, commentaire: string | undefined, verifieParId: string) {
    const document = await this.prisma.documentDemande.findFirst({
      where: { id: documentId, demande: { ecoleId } },
    });
    if (!document) {
      throw new NotFoundException('Document introuvable');
    }
    if (statut !== 'VERIFIE' && statut !== 'REJETE') {
      throw new BadRequestException('Statut de vérification invalide');
    }
    return this.prisma.documentDemande.update({
      where: { id: documentId },
      data: { statut: statut as any, commentaire, verifieParId },
    });
  }
}
