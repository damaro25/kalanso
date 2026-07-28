import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLivreDto, UpdateLivreDto } from './dto/livre.dto';
import { CreateEmpruntDto } from './dto/emprunt.dto';

@Injectable()
export class BibliothequeService {
  constructor(private prisma: PrismaService) {}

  // ── Livres (catalogue) ──

  async findAllLivres(ecoleId: string) {
    const livres = await this.prisma.livre.findMany({ where: { ecoleId }, orderBy: { titre: 'asc' } });
    // Nombre d'exemplaires actuellement empruntés par livre
    const empruntsEnCours = await this.prisma.emprunt.groupBy({
      by: ['livreId'],
      where: { ecoleId, statut: 'EN_COURS' },
      _count: { _all: true },
    });
    const empruntesParLivre = new Map(empruntsEnCours.map((e) => [e.livreId, e._count._all]));

    return livres.map((l) => {
      const empruntes = empruntesParLivre.get(l.id) ?? 0;
      return {
        ...l,
        quantiteEmpruntee: empruntes,
        quantiteDisponible: Math.max(0, l.quantiteTotale - empruntes),
      };
    });
  }

  createLivre(ecoleId: string, dto: CreateLivreDto) {
    return this.prisma.livre.create({
      data: {
        ecoleId,
        titre: dto.titre,
        auteur: dto.auteur,
        isbn: dto.isbn,
        categorie: dto.categorie,
        quantiteTotale: dto.quantiteTotale,
      },
    });
  }

  async updateLivre(ecoleId: string, id: string, dto: UpdateLivreDto) {
    await this.prisma.livre.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.livre.update({ where: { id }, data: dto });
  }

  async removeLivre(ecoleId: string, id: string) {
    await this.prisma.livre.findFirstOrThrow({ where: { id, ecoleId } });
    const empruntsEnCours = await this.prisma.emprunt.count({ where: { livreId: id, statut: 'EN_COURS' } });
    if (empruntsEnCours > 0) {
      throw new BadRequestException('Ce livre a des emprunts en cours, retour requis avant suppression');
    }
    await this.prisma.emprunt.deleteMany({ where: { livreId: id } });
    return this.prisma.livre.delete({ where: { id } });
  }

  // ── Emprunts ──

  async emprunter(ecoleId: string, dto: CreateEmpruntDto) {
    const livre = await this.prisma.livre.findFirst({ where: { id: dto.livreId, ecoleId } });
    if (!livre) throw new NotFoundException('Livre introuvable');
    await this.prisma.eleve.findFirstOrThrow({ where: { id: dto.eleveId, ecoleId } });

    const empruntes = await this.prisma.emprunt.count({ where: { livreId: dto.livreId, statut: 'EN_COURS' } });
    if (empruntes >= livre.quantiteTotale) {
      throw new BadRequestException('Aucun exemplaire disponible pour ce livre');
    }

    const dateRetourPrevue = dto.dateRetourPrevue
      ? new Date(dto.dateRetourPrevue)
      : new Date(Date.now() + 14 * 24 * 60 * 60 * 1000); // 2 semaines par défaut

    return this.prisma.emprunt.create({
      data: {
        ecoleId,
        livreId: dto.livreId,
        eleveId: dto.eleveId,
        dateRetourPrevue,
      },
      include: { livre: true, eleve: true },
    });
  }

  async retourner(ecoleId: string, id: string) {
    const emprunt = await this.prisma.emprunt.findFirst({ where: { id, ecoleId } });
    if (!emprunt) throw new NotFoundException('Emprunt introuvable');
    if (emprunt.statut === 'RETOURNE') {
      throw new BadRequestException('Cet emprunt est déjà retourné');
    }
    return this.prisma.emprunt.update({
      where: { id },
      data: { statut: 'RETOURNE', dateRetourEffective: new Date() },
    });
  }

  async findEmprunts(ecoleId: string, statut?: string) {
    const emprunts = await this.prisma.emprunt.findMany({
      where: { ecoleId, statut: statut as any },
      include: { livre: true, eleve: true },
      orderBy: { dateEmprunt: 'desc' },
    });
    const maintenant = new Date();
    return emprunts.map((e) => ({
      ...e,
      enRetard: e.statut === 'EN_COURS' && e.dateRetourPrevue < maintenant,
    }));
  }

  async resume(ecoleId: string) {
    const [nbTitres, exemplaires, empruntsEnCours] = await Promise.all([
      this.prisma.livre.count({ where: { ecoleId } }),
      this.prisma.livre.aggregate({ where: { ecoleId }, _sum: { quantiteTotale: true } }),
      this.prisma.emprunt.findMany({ where: { ecoleId, statut: 'EN_COURS' }, select: { dateRetourPrevue: true } }),
    ]);
    const maintenant = new Date();
    const enRetard = empruntsEnCours.filter((e) => e.dateRetourPrevue < maintenant).length;
    return {
      nbTitres,
      totalExemplaires: exemplaires._sum.quantiteTotale ?? 0,
      empruntsEnCours: empruntsEnCours.length,
      enRetard,
    };
  }
}
