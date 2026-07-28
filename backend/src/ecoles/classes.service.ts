import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateClasseDto, UpdateClasseDto } from './dto/classe.dto';

@Injectable()
export class ClassesService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.classe.findMany({
      where: { ecoleId, actif: true },
      include: { niveau: true, anneeScolaire: true, _count: { select: { inscriptions: true } } },
      orderBy: [{ anneeScolaire: { dateDebut: 'desc' } }, { nom: 'asc' }],
    });
  }

  create(ecoleId: string, dto: CreateClasseDto) {
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

  async eleves(ecoleId: string, classeId: string) {
    await this.prisma.classe.findFirstOrThrow({ where: { id: classeId, ecoleId } });
    const inscriptions = await this.prisma.inscription.findMany({
      where: { classeId, ecoleId, statut: 'EN_COURS' },
      include: { eleve: true },
    });
    return inscriptions.map((i) => i.eleve);
  }

  async effectifs(ecoleId: string) {
    const classes = await this.prisma.classe.findMany({
      where: { ecoleId, actif: true },
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
        nom: classe.nom,
        niveau: classe.niveau.nom,
        anneeScolaire: classe.anneeScolaire.libelle,
        fraisInscription,
        ecolage,
        filles,
        garcons,
        total: filles + garcons,
      };
    });
  }
}
