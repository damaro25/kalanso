import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { readFile, stat, unlink } from 'fs/promises';
import { basename, join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { DOSSIER_UPLOADS } from '../admissions/documents.service';
import { DOSSIER_PHOTOS, TAILLE_MAX_PHOTO } from './photo-upload.config';
import { genererPlancheCartesPdf, type CarteData } from './carte-pdf.util';

export type SourcePhoto = 'ELEVE' | 'ADMISSION';
type MimePhoto = 'image/jpeg' | 'image/png';

interface PhotoTrouvee {
  chemin: string;
  mime: MimePhoto;
  source: SourcePhoto;
}

interface EleveAvecPhoto {
  id: string;
  photoUrl: string | null;
}

// Type réel d'un fichier d'après ses premiers octets (l'extension et le type MIME déclarés ne prouvent rien).
export function mimeDepuisContenu(contenu: Buffer): MimePhoto | null {
  if (contenu.length >= 3 && contenu[0] === 0xff && contenu[1] === 0xd8 && contenu[2] === 0xff) return 'image/jpeg';
  if (contenu.length >= 8 && contenu.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  return null;
}

function slug(texte: string): string {
  return texte.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
}

@Injectable()
export class CartesScolairesService {
  constructor(private prisma: PrismaService) {}

  // ── Accès disque, isolé pour pouvoir être remplacé dans les tests ──────────────────────────

  async tailleFichier(chemin: string): Promise<number | null> {
    try {
      return (await stat(chemin)).size;
    } catch {
      return null;
    }
  }

  async lireFichier(chemin: string): Promise<Buffer | null> {
    try {
      return await readFile(chemin);
    } catch {
      return null;
    }
  }

  async supprimerFichier(chemin: string): Promise<void> {
    try {
      await unlink(chemin);
    } catch {
      // déjà absent : rien à nettoyer
    }
  }

  // ── Photo ──────────────────────────────────────────────────────────────────────────────────

  // Photo propre à la fiche d'abord, à défaut la photo déposée à l'admission (hors documents rejetés).
  // Une seule requête pour tous les élèves demandés : la planche d'une classe ne fait pas N requêtes.
  private async trouverPhotos(ecoleId: string, eleves: EleveAvecPhoto[]): Promise<Map<string, PhotoTrouvee | null>> {
    const resultat = new Map<string, PhotoTrouvee | null>();
    const sansPhotoFiche: string[] = [];

    for (const eleve of eleves) {
      if (eleve.photoUrl) {
        const chemin = join(DOSSIER_PHOTOS, basename(eleve.photoUrl));
        if ((await this.tailleFichier(chemin)) !== null) {
          resultat.set(eleve.id, { chemin, mime: eleve.photoUrl.endsWith('.png') ? 'image/png' : 'image/jpeg', source: 'ELEVE' });
          continue;
        }
      }
      sansPhotoFiche.push(eleve.id);
    }

    if (sansPhotoFiche.length > 0) {
      const documents = await this.prisma.documentDemande.findMany({
        where: {
          type: 'PHOTO',
          statut: { not: 'REJETE' },
          mimeType: { in: ['image/jpeg', 'image/png'] },
          demande: { ecoleId, eleveId: { in: sansPhotoFiche } },
        },
        include: { demande: { select: { eleveId: true } } },
        orderBy: { createdAt: 'desc' },
      });
      for (const doc of documents) {
        const eleveId = doc.demande.eleveId as string;
        if (resultat.has(eleveId)) continue; // la plus récente d'abord
        const chemin = join(DOSSIER_UPLOADS, basename(doc.cheminFichier));
        const taille = await this.tailleFichier(chemin);
        if (taille !== null && taille <= TAILLE_MAX_PHOTO) {
          resultat.set(eleveId, { chemin, mime: doc.mimeType as MimePhoto, source: 'ADMISSION' });
        }
      }
    }

    for (const eleve of eleves) if (!resultat.has(eleve.id)) resultat.set(eleve.id, null);
    return resultat;
  }

  async lirePhotoEleve(ecoleId: string, eleveId: string): Promise<{ contenu: Buffer; mime: MimePhoto }> {
    const eleve = await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    const photo = (await this.trouverPhotos(ecoleId, [eleve])).get(eleve.id);
    const contenu = photo ? await this.lireFichier(photo.chemin) : null;
    if (!photo || !contenu) throw new NotFoundException('Aucune photo pour cet élève');
    return { contenu, mime: photo.mime };
  }

  async televerserPhoto(
    ecoleId: string,
    eleveId: string,
    fichier: { filename: string; path: string; mimetype: string },
  ): Promise<{ photo: SourcePhoto }> {
    const eleve = await this.prisma.eleve.findFirst({ where: { id: eleveId, ecoleId } });
    if (!eleve) {
      await this.supprimerFichier(fichier.path);
      throw new NotFoundException('Élève introuvable');
    }

    const contenu = await this.lireFichier(fichier.path);
    const reel = contenu ? mimeDepuisContenu(contenu) : null;
    if (!reel || reel !== fichier.mimetype) {
      await this.supprimerFichier(fichier.path);
      throw new BadRequestException("Le fichier envoyé n'est pas une image JPEG ou PNG valide");
    }

    await this.prisma.eleve.update({ where: { id: eleveId }, data: { photoUrl: fichier.filename } });
    if (eleve.photoUrl && eleve.photoUrl !== fichier.filename) {
      await this.supprimerFichier(join(DOSSIER_PHOTOS, basename(eleve.photoUrl)));
    }
    return { photo: 'ELEVE' };
  }

  async supprimerPhoto(ecoleId: string, eleveId: string): Promise<{ supprimee: boolean }> {
    const eleve = await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    if (!eleve.photoUrl) return { supprimee: false };
    await this.prisma.eleve.update({ where: { id: eleveId }, data: { photoUrl: null } });
    await this.supprimerFichier(join(DOSSIER_PHOTOS, basename(eleve.photoUrl)));
    return { supprimee: true };
  }

  // ── Informations sur la carte ──────────────────────────────────────────────────────────────

  private async resoudreAnnee(ecoleId: string) {
    const courante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (courante) return courante;
    const derniere = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
    if (!derniere) throw new BadRequestException('Aucune année scolaire définie');
    return derniere;
  }

  async infoEleve(ecoleId: string, eleveId: string) {
    const annee = await this.resoudreAnnee(ecoleId);
    const eleve = await this.prisma.eleve.findFirstOrThrow({
      where: { id: eleveId, ecoleId },
      include: {
        inscriptions: {
          where: { anneeScolaireId: annee.id, statut: 'EN_COURS' },
          include: { classe: { include: { niveau: true } } },
        },
      },
    });
    const photo = (await this.trouverPhotos(ecoleId, [eleve])).get(eleve.id);
    const inscription = eleve.inscriptions[0];
    return {
      eleveId: eleve.id,
      nomComplet: `${eleve.prenom} ${eleve.nom}`,
      matricule: eleve.matricule,
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      classe: inscription ? { id: inscription.classe.id, nom: inscription.classe.nom, niveau: inscription.classe.niveau.nom } : null,
      photo: photo?.source ?? null,
      peutGenerer: !!inscription,
    };
  }

  private async inscritsDeLaClasse(ecoleId: string, classeId: string) {
    const classe = await this.prisma.classe.findFirstOrThrow({
      where: { id: classeId, ecoleId },
      include: { niveau: true, anneeScolaire: true },
    });
    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, classeId, anneeScolaireId: classe.anneeScolaireId, statut: 'EN_COURS', eleve: { actif: true } },
      include: { eleve: true },
    });
    const eleves = inscriptions
      .map((i: { eleve: any }) => i.eleve)
      .sort((a: any, b: any) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
    return { classe, eleves };
  }

  async apercuClasse(ecoleId: string, classeId: string) {
    const { classe, eleves } = await this.inscritsDeLaClasse(ecoleId, classeId);
    const photos = await this.trouverPhotos(ecoleId, eleves);
    const lignes = eleves.map((e: any) => ({
      eleveId: e.id as string,
      matricule: e.matricule as string | null,
      nomComplet: `${e.prenom} ${e.nom}`,
      photo: photos.get(e.id)?.source ?? null,
    }));
    return {
      anneeScolaire: { id: classe.anneeScolaire.id, libelle: classe.anneeScolaire.libelle },
      classe: { id: classe.id, nom: classe.nom, niveau: classe.niveau.nom },
      resume: { eleves: lignes.length, sansPhoto: lignes.filter((l: { photo: SourcePhoto | null }) => !l.photo).length },
      eleves: lignes,
    };
  }

  // ── Génération du PDF ──────────────────────────────────────────────────────────────────────

  private async construireCartes(ecoleId: string, eleves: any[], classe: { nom: string; niveau: { nom: string } }): Promise<CarteData[]> {
    const photos = await this.trouverPhotos(ecoleId, eleves);
    const cartes: CarteData[] = [];
    for (const e of eleves) {
      const trouvee = photos.get(e.id);
      cartes.push({
        matricule: e.matricule,
        nom: e.nom,
        prenom: e.prenom,
        dateNaissance: e.dateNaissance,
        lieuNaissance: e.lieuNaissance,
        classe: classe.nom,
        niveau: classe.niveau.nom,
        photo: trouvee ? await this.lireFichier(trouvee.chemin) : null,
        codeQr: e.matricule ?? e.id,
      });
    }
    return cartes;
  }

  async pdfClasse(ecoleId: string, classeId: string): Promise<{ pdf: Buffer; nomFichier: string }> {
    const { classe, eleves } = await this.inscritsDeLaClasse(ecoleId, classeId);
    if (eleves.length === 0) throw new BadRequestException('Aucun élève inscrit dans cette classe');
    const ecole = await this.prisma.ecole.findUniqueOrThrow({ where: { id: ecoleId } });
    const cartes = await this.construireCartes(ecoleId, eleves, classe);
    const pdf = await genererPlancheCartesPdf(ecole, classe.anneeScolaire.libelle, cartes);
    return { pdf, nomFichier: `cartes-scolaires-${slug(classe.nom)}.pdf` };
  }

  async pdfEleve(ecoleId: string, eleveId: string): Promise<{ pdf: Buffer; nomFichier: string }> {
    const annee = await this.resoudreAnnee(ecoleId);
    const eleve = await this.prisma.eleve.findFirstOrThrow({
      where: { id: eleveId, ecoleId },
      include: {
        inscriptions: {
          where: { anneeScolaireId: annee.id, statut: 'EN_COURS' },
          include: { classe: { include: { niveau: true } } },
        },
      },
    });
    const inscription = eleve.inscriptions[0];
    if (!inscription) {
      throw new BadRequestException("L'élève n'est inscrit dans aucune classe cette année : affectez-le d'abord à une classe");
    }
    const ecole = await this.prisma.ecole.findUniqueOrThrow({ where: { id: ecoleId } });
    const cartes = await this.construireCartes(ecoleId, [eleve], inscription.classe);
    const pdf = await genererPlancheCartesPdf(ecole, annee.libelle, cartes);
    return { pdf, nomFichier: `carte-scolaire-${slug(`${eleve.prenom} ${eleve.nom}`)}.pdf` };
  }
}
