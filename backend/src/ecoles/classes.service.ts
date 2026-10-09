import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClasseDto, UpdateClasseDto } from './dto/classe.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  // Toutes les classes de l'école, toutes années confondues (page de gestion des classes,
  // suivi de parcours). Avec `courante`, seulement celles de l'année scolaire en cours (à défaut
  // d'année courante, la plus récente) : c'est la liste à proposer dans tous les filtres et
  // sélecteurs de classe, une classe d'une année passée n'ayant pas de sens au quotidien.
  // `classeIds` non nul : périmètre d'un enseignant, on ne renvoie que ses classes.
  async findAll(ecoleId: string, options: { courante?: boolean; classeIds?: string[] | null } = {}) {
    let anneeScolaireId: string | undefined;
    if (options.courante) {
      const annee =
        (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } })) ??
        (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } }));
      if (!annee) return [];
      anneeScolaireId = annee.id;
    }

    return this.prisma.classe.findMany({
      where: {
        ecoleId,
        actif: true,
        ...(anneeScolaireId ? { anneeScolaireId } : {}),
        ...(options.classeIds ? { id: { in: options.classeIds } } : {}),
      },
      include: { niveau: true, anneeScolaire: true, _count: { select: { inscriptions: true } } },
      orderBy: [{ anneeScolaire: { dateDebut: 'desc' } }, { nom: 'asc' }],
    });
  }

  async create(ecoleId: string, dto: CreateClasseDto) {
    // Le niveau et l'année viennent du client : sans ce contrôle, une classe
    // pourrait être rattachée au niveau ou à l'année d'une autre école.
    const [niveau, annee] = await Promise.all([
      this.prisma.niveau.findFirst({ where: { id: dto.niveauId, ecoleId } }),
      this.prisma.anneeScolaire.findFirst({ where: { id: dto.anneeScolaireId, ecoleId } }),
    ]);
    if (!niveau) throw new BadRequestException('Niveau invalide');
    if (!annee) throw new BadRequestException('Année scolaire invalide');

    return this.prisma.classe.create({
      data: {
        ecoleId,
        nom: dto.nom,
        niveauId: dto.niveauId,
        anneeScolaireId: dto.anneeScolaireId,
        capaciteMax: dto.capaciteMax,
      },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdateClasseDto) {
    await this.prisma.classe.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.classe.update({ where: { id }, data: dto });
  }

  // Suppression définitive, autorisée uniquement si aucun élève n'a jamais
  // été inscrit dans cette classe (notes/absences ne peuvent pas exister sans
  // inscription, donc ce seul contrôle suffit). Les créneaux d'emploi du temps
  // ne sont que des cases horaires planifiées, pas des enregistrements
  // historiques : ils sont supprimés avec la classe sans risque.
  async remove(ecoleId: string, id: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id, ecoleId } });

    const nbInscriptions = await this.prisma.inscription.count({ where: { classeId: id } });
    if (nbInscriptions > 0) {
      throw new BadRequestException("Cette classe a des élèves inscrits (actuels ou passés), suppression impossible.");
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.creneau.deleteMany({ where: { classeId: id } });
      return tx.classe.delete({ where: { id } });
    });
  }

  async eleves(ecoleId: string, classeId: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    const inscriptions = await this.prisma.inscription.findMany({
      where: { classeId, ecoleId, statut: 'EN_COURS' },
      include: { eleve: true },
    });
    return inscriptions.map((i) => i.eleve);
  }

  // Pour un enseignant (`classeIds` non nul) : ses classes seulement, sans les montants d'écolage ni de frais d'inscription.
  async effectifs(ecoleId: string, classeIds: string[] | null = null) {
    const classes = await this.prisma.classe.findMany({
      where: { ecoleId, actif: true, ...(classeIds ? { id: { in: classeIds } } : {}) },
      include: {
        niveau: true,
        anneeScolaire: true,
        inscriptions: { where: { statut: 'EN_COURS' }, include: { eleve: true } },
      },
      orderBy: [{ anneeScolaire: { dateDebut: 'desc' } }, { nom: 'asc' }],
    });

    const defauts = await this.prisma.fraisInscriptionNiveau.findMany({ where: { ecoleId } });
    const defautParNiveauEtAnnee = new Map(defauts.map((d) => [`${d.niveauId}:${d.anneeScolaireId}`, Number(d.montant)]));

    // Écolage total du niveau : somme de tous les tarifs définis pour ce
    // niveau et cette année (ex: "Écolage annuel" + "Trimestre 1" + ...),
    // pour donner une vision globale du coût par classe.
    const tarifs = await this.prisma.tarifEcolage.findMany({ where: { ecoleId } });
    const ecolageParNiveauEtAnnee = new Map<string, number>();
    for (const t of tarifs) {
      const cle = `${t.niveauId}:${t.anneeScolaireId}`;
      ecolageParNiveauEtAnnee.set(cle, (ecolageParNiveauEtAnnee.get(cle) ?? 0) + Number(t.montant));
    }

    return classes.map((classe) => {
      const filles = classe.inscriptions.filter((i) => i.eleve.genre === 'F').length;
      const garcons = classe.inscriptions.filter((i) => i.eleve.genre === 'M').length;
      const fraisInscription = defautParNiveauEtAnnee.get(`${classe.niveauId}:${classe.anneeScolaireId}`) ?? 0;
      const ecolage = ecolageParNiveauEtAnnee.get(`${classe.niveauId}:${classe.anneeScolaireId}`) ?? 0;
      return {
        classeId: classe.id,
        capaciteMax: classe.capaciteMax,
        nom: classe.nom,
        niveau: classe.niveau.nom,
        anneeScolaire: classe.anneeScolaire.libelle,
        ...(classeIds ? {} : { fraisInscription, ecolage }),
        filles,
        garcons,
        total: filles + garcons,
      };
    });
  }
}
