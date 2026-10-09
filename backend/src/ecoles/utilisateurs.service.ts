import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUtilisateurDto, UpdateUtilisateurDto } from './dto/utilisateur.dto';

const SELECTION_PUBLIQUE = {
  id: true,
  nom: true,
  prenom: true,
  email: true,
  role: true,
  actif: true,
  createdAt: true,
  personnelId: true,
  personnel: { select: { nom: true, prenom: true } },
};

@Injectable()
export class UtilisateursService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.utilisateur.findMany({
      where: { ecoleId },
      select: SELECTION_PUBLIQUE,
      orderBy: { nom: 'asc' },
    });
  }

  // Un compte enseignant n'accède qu'à ses classes : il doit donc être relié à la fiche du personnel d'un
  // enseignant de la même école, et deux comptes ne peuvent pas partager la même fiche.
  private async verifierLienPersonnel(ecoleId: string, role: string, personnelId: string | null | undefined, utilisateurId?: string) {
    if (role !== 'ENSEIGNANT') return null;
    if (!personnelId) {
      throw new BadRequestException('Un compte enseignant doit être relié à une fiche du personnel (enseignant)');
    }
    const personnel = await this.prisma.personnel.findFirst({ where: { id: personnelId, ecoleId, actif: true } });
    if (!personnel || personnel.type !== 'ENSEIGNANT') {
      throw new BadRequestException("La fiche du personnel choisie n'existe pas ou n'est pas celle d'un enseignant");
    }
    const dejaLie = await this.prisma.utilisateur.findFirst({
      where: { personnelId, ...(utilisateurId ? { NOT: { id: utilisateurId } } : {}) },
    });
    if (dejaLie) {
      throw new BadRequestException('Cet enseignant a déjà un compte');
    }
    return personnelId;
  }

  async create(ecoleId: string, dto: CreateUtilisateurDto) {
    const emailExistant = await this.prisma.utilisateur.findUnique({ where: { email: dto.email } });
    if (emailExistant) {
      throw new BadRequestException('Un compte existe déjà avec cet email');
    }
    const personnelId = await this.verifierLienPersonnel(ecoleId, dto.role, dto.personnelId);
    const motDePasseHash = await bcrypt.hash(dto.password, 12);
    return this.prisma.utilisateur.create({
      data: {
        ecoleId,
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        motDePasseHash,
        role: dto.role,
        personnelId,
      },
      select: SELECTION_PUBLIQUE,
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateUtilisateurDto, demandeurId: string) {
    const utilisateur = await this.prisma.utilisateur.findFirst({ where: { id, ecoleId } });
    if (!utilisateur) {
      throw new NotFoundException('Compte introuvable');
    }
    if (dto.actif === false && id === demandeurId) {
      throw new ForbiddenException('Impossible de désactiver votre propre compte');
    }

    // Le lien avec la fiche du personnel n'est contrôlé (et modifié) que si la demande touche au rôle ou au lien :
    // désactiver ou réinitialiser le mot de passe d'un ancien compte enseignant non relié reste possible.
    const touchLien = dto.personnelId !== undefined || (dto.role !== undefined && dto.role !== utilisateur.role);
    let personnelId: string | null | undefined;
    if (touchLien) {
      const role = dto.role ?? utilisateur.role;
      const demande = dto.personnelId !== undefined ? dto.personnelId : utilisateur.personnelId;
      personnelId = await this.verifierLienPersonnel(ecoleId, role, demande, id);
    }

    const motDePasseHash = dto.password ? await bcrypt.hash(dto.password, 12) : undefined;

    return this.prisma.utilisateur.update({
      where: { id },
      data: {
        nom: dto.nom,
        prenom: dto.prenom,
        email: dto.email,
        role: dto.role,
        actif: dto.actif,
        ...(personnelId !== undefined ? { personnelId } : {}),
        ...(motDePasseHash ? { motDePasseHash } : {}),
      },
      select: SELECTION_PUBLIQUE,
    });
  }
}
