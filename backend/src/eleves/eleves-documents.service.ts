import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, rmSync } from 'fs';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { TypeDocument } from '../generated/prisma/enums';
import { DOSSIER_UPLOADS } from '../admissions/documents.service';

const TYPES_VALIDES = Object.values(TypeDocument) as string[];

type FichierRecu = { originalname: string; filename: string; mimetype: string; size: number };

// Multer lit le nom du fichier en latin1 : « Capture d’écran » arrive en « Capture d'Ã©cran ».
// Pour un nom déjà enregistré ainsi, la conversion n'est faite que si elle donne un texte valide.
export function nomLisible(nom: string, toujours = false) {
  if (!toujours && !/[ÃÂâ]/.test(nom)) return nom;
  const converti = Buffer.from(nom, 'latin1').toString('utf8');
  return converti.includes('\uFFFD') ? nom : converti;
}

// Pièces du dossier d'un élève (extrait de naissance, photo, relevés...). Elles sont rangées avec la
// demande d'inscription de l'élève, comme celles jointes à l'ajout ; un élève sans demande (importé,
// par exemple) en reçoit une, déjà acceptée, à son premier document.
@Injectable()
export class ElevesDocumentsService {
  constructor(private prisma: PrismaService) {}

  private async eleve(ecoleId: string, eleveId: string) {
    const eleve = await this.prisma.eleve.findFirst({
      where: { id: eleveId, ecoleId },
      include: { parentsLiens: { include: { parentTuteur: true }, orderBy: { contactPrincipal: 'desc' } } },
    });
    if (!eleve) throw new NotFoundException('Élève introuvable');
    return eleve;
  }

  private async document(ecoleId: string, eleveId: string, documentId: string) {
    const document = await this.prisma.documentDemande.findFirst({ where: { id: documentId, demande: { ecoleId, eleveId } } });
    if (!document) throw new NotFoundException('Document introuvable');
    return document;
  }

  private verifierType(type: string) {
    if (!TYPES_VALIDES.includes(type)) throw new BadRequestException('Type de document invalide');
    return type as TypeDocument;
  }

  // Le fichier remplacé ou supprimé ne sert plus : il est retiré du disque.
  private effacerFichier(cheminFichier: string) {
    rmSync(join(DOSSIER_UPLOADS, basename(cheminFichier)), { force: true });
  }

  async lister(ecoleId: string, eleveId: string) {
    await this.eleve(ecoleId, eleveId);
    const documents = await this.prisma.documentDemande.findMany({
      where: { demande: { ecoleId, eleveId } },
      orderBy: { createdAt: 'asc' },
    });
    return documents.map((d) => ({ ...d, nomFichier: nomLisible(d.nomFichier) }));
  }

  async ajouter(ecoleId: string, eleveId: string, type: string, fichier: FichierRecu) {
    const typeDocument = this.verifierType(type);
    const eleve = await this.eleve(ecoleId, eleveId);
    let demande = await this.prisma.demandeInscription.findFirst({ where: { ecoleId, eleveId }, orderBy: { createdAt: 'desc' } });
    if (!demande) {
      const parent = eleve.parentsLiens[0]?.parentTuteur;
      demande = await this.prisma.demandeInscription.create({
        data: {
          ecoleId,
          eleveId,
          statut: 'ACCEPTEE',
          nomEleve: eleve.nom,
          prenomEleve: eleve.prenom,
          genre: eleve.genre,
          dateNaissance: eleve.dateNaissance,
          lieuNaissance: eleve.lieuNaissance,
          nomParent: parent?.nom ?? '',
          prenomParent: parent?.prenom ?? '',
          telephoneParent: parent?.telephone ?? '',
          piecesJointes: "Dossier de l'élève",
        },
      });
    }
    return this.prisma.documentDemande.create({
      data: {
        demandeId: demande.id,
        type: typeDocument,
        nomFichier: nomLisible(fichier.originalname, true),
        cheminFichier: fichier.filename,
        mimeType: fichier.mimetype,
        tailleOctets: fichier.size,
      },
    });
  }

  // Changer le type et/ou remplacer le fichier d'une pièce
  async modifier(ecoleId: string, eleveId: string, documentId: string, type: string | undefined, fichier?: FichierRecu) {
    const document = await this.document(ecoleId, eleveId, documentId);
    const maj = await this.prisma.documentDemande.update({
      where: { id: documentId },
      data: {
        ...(type ? { type: this.verifierType(type) } : {}),
        ...(fichier
          ? {
              nomFichier: nomLisible(fichier.originalname, true),
              cheminFichier: fichier.filename,
              mimeType: fichier.mimetype,
              tailleOctets: fichier.size,
              statut: 'EN_ATTENTE' as const,
              commentaire: null,
            }
          : {}),
      },
    });
    if (fichier) this.effacerFichier(document.cheminFichier);
    return maj;
  }

  async supprimer(ecoleId: string, eleveId: string, documentId: string) {
    const document = await this.document(ecoleId, eleveId, documentId);
    await this.prisma.documentDemande.delete({ where: { id: documentId } });
    this.effacerFichier(document.cheminFichier);
    return { ok: true };
  }

  async pourTelechargement(ecoleId: string, eleveId: string, documentId: string) {
    const document = await this.document(ecoleId, eleveId, documentId);
    const chemin = join(DOSSIER_UPLOADS, basename(document.cheminFichier));
    if (!existsSync(chemin)) throw new NotFoundException('Fichier introuvable sur le serveur');
    return { document: { ...document, nomFichier: nomLisible(document.nomFichier) }, chemin };
  }
}
