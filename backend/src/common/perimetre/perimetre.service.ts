import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { JwtPayloadUser } from '../decorators/current-user.decorator';

const ROLE_RESTREINT = 'ENSEIGNANT';

// Périmètre de données d'un utilisateur. Seul l'enseignant est restreint : il n'accède qu'aux classes de
// l'année en cours où il a un créneau dans l'emploi du temps ou que la direction lui a affectées, et aux
// élèves inscrits dans ces classes. Les autres rôles ne sont pas limités (valeur `null`).
@Injectable()
export class PerimetreService {
  constructor(private prisma: PrismaService) {}

  estRestreint(user: Pick<JwtPayloadUser, 'role'>): boolean {
    return user.role === ROLE_RESTREINT;
  }

  private async anneeReferenceId(ecoleId: string): Promise<string | undefined> {
    const courante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (courante) return courante.id;
    const derniere = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
    return derniere?.id;
  }

  // `null` : aucune restriction. Sinon, identifiants des classes accessibles (liste vide : aucun accès,
  // par exemple un compte enseignant qui n'est relié à aucune fiche du personnel).
  async classesAutorisees(user: JwtPayloadUser): Promise<string[] | null> {
    if (!this.estRestreint(user)) return null;
    if (!user.personnelId) return [];
    const anneeScolaireId = await this.anneeReferenceId(user.ecoleId);
    if (!anneeScolaireId) return [];

    const [creneaux, affectations] = await Promise.all([
      this.prisma.creneau.findMany({
        where: { ecoleId: user.ecoleId, personnelId: user.personnelId, anneeScolaireId },
        select: { classeId: true },
      }),
      this.prisma.affectationEnseignant.findMany({
        where: { ecoleId: user.ecoleId, personnelId: user.personnelId, classe: { anneeScolaireId } },
        select: { classeId: true },
      }),
    ]);
    return [...new Set([...creneaux, ...affectations].map((c) => c.classeId))];
  }

  async exigerClasse(user: JwtPayloadUser, classeId: string | undefined | null): Promise<void> {
    const autorisees = await this.classesAutorisees(user);
    if (autorisees === null) return;
    if (!classeId || !autorisees.includes(classeId)) {
      throw new ForbiddenException("Cette classe ne fait pas partie de vos classes");
    }
  }

  async exigerEleve(user: JwtPayloadUser, eleveId: string): Promise<void> {
    const autorisees = await this.classesAutorisees(user);
    if (autorisees === null) return;
    const inscription =
      autorisees.length > 0
        ? await this.prisma.inscription.findFirst({
            where: { ecoleId: user.ecoleId, eleveId, statut: 'EN_COURS', classeId: { in: autorisees } },
            select: { id: true },
          })
        : null;
    if (!inscription) {
      throw new ForbiddenException("Cet élève n'est pas dans l'une de vos classes");
    }
  }
}
