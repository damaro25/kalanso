import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from '../finances/factures.service';
import { UpdateEleveDto } from './dto/eleve.dto';
import { CreateParentTuteurDto, LinkParentDto } from './dto/parent-tuteur.dto';
import { CreateInscriptionDto } from './dto/inscription.dto';

@Injectable()
export class ElevesService {
  constructor(
    private prisma: PrismaService,
    private facturesService: FacturesService,
  ) {}

  findAll(ecoleId: string) {
    return this.prisma.eleve.findMany({ where: { ecoleId, actif: true }, orderBy: { nom: 'asc' } });
  }

  async update(ecoleId: string, id: string, dto: UpdateEleveDto) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.eleve.update({
      where: { id },
      data: {
        ...dto,
        dateNaissance: dto.dateNaissance ? new Date(dto.dateNaissance) : undefined,
      },
    });
  }

  // Radier un élève doit aussi clore son inscription en cours : sinon il reste
  // compté dans l'effectif de sa classe, sur la feuille d'appel, et continue
  // d'être facturé (écolage, rattrapage) alors qu'il n'est plus dans l'école.
  async remove(ecoleId: string, id: string) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id, ecoleId } });
    const [eleve] = await this.prisma.$transaction([
      this.prisma.eleve.update({ where: { id }, data: { actif: false } }),
      this.prisma.inscription.updateMany({
        where: { eleveId: id, ecoleId, statut: 'EN_COURS' },
        data: { statut: 'ABANDONNEE' },
      }),
    ]);
    return eleve;
  }

  async fiche(ecoleId: string, id: string) {
    const eleve = await this.prisma.eleve.findFirstOrThrow({
      where: { id, ecoleId },
      include: {
        inscriptions: {
          where: { statut: 'EN_COURS' },
          include: { classe: { include: { niveau: true } } },
        },
        parentsLiens: { include: { parentTuteur: true } },
        factures: {
          orderBy: { createdAt: 'desc' },
          include: { paiements: { orderBy: { datePaiement: 'desc' } } },
        },
        demandesInscription: {
          select: { id: true, createdAt: true, niveauSouhaite: true, traiteeParId: true },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    // Scopé à l'année courante : le reste de la fiche (classe actuelle, solde)
    // reflète l'année en cours, un cumul multi-années serait trompeur ici.
    const anneeCourante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const absencesCount = await this.prisma.absence.count({
      where: {
        eleveId: id,
        statut: { in: ['ABSENT', 'RETARD'] },
        ...(anneeCourante ? { anneeScolaireId: anneeCourante.id } : {}),
      },
    });

    const solde = eleve.factures.reduce(
      (acc, f) => acc + (Number(f.montantTotal) - Number(f.montantPaye)),
      0,
    );

    return { ...eleve, absencesCount, solde };
  }

  findAllParents(ecoleId: string) {
    return this.prisma.parentTuteur.findMany({ where: { ecoleId }, orderBy: { nom: 'asc' } });
  }

  createParent(ecoleId: string, dto: CreateParentTuteurDto) {
    return this.prisma.parentTuteur.create({ data: { ecoleId, ...dto } });
  }

  async linkParent(ecoleId: string, eleveId: string, dto: LinkParentDto) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    await this.prisma.parentTuteur.findFirstOrThrow({ where: { id: dto.parentTuteurId, ecoleId } });
    return this.prisma.eleveParent.create({
      data: {
        eleveId,
        parentTuteurId: dto.parentTuteurId,
        lien: dto.lien,
        contactPrincipal: dto.contactPrincipal ?? false,
      },
    });
  }

  async inscrire(ecoleId: string, dto: CreateInscriptionDto) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: dto.eleveId, ecoleId } });
    const classe = await this.prisma.classe.findFirstOrThrow({ where: { id: dto.classeId, ecoleId } });

    // L'année scolaire de l'inscription est toujours celle de la classe choisie —
    // jamais l'année courante, qui pourrait ne pas correspondre à cette classe.
    const anneeScolaireId = classe.anneeScolaireId;

    const inscription = await this.prisma.inscription.upsert({
      where: { eleveId_anneeScolaireId: { eleveId: dto.eleveId, anneeScolaireId } },
      update: { classeId: classe.id },
      create: {
        ecoleId,
        eleveId: dto.eleveId,
        classeId: classe.id,
        anneeScolaireId,
      },
    });

    await this.facturesService.genererFacturesEnrolement(ecoleId, dto.eleveId, classe.id, anneeScolaireId);

    return inscription;
  }
}
