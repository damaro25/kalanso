import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePersonnelDto, UpdatePersonnelDto } from './dto/personnel.dto';

// Approximation utilisée pour convertir un volume hebdomadaire (déduit des
// créneaux réels de l'emploi du temps) en base mensuelle : l'application ne
// modélise pas encore de calendrier scolaire (vacances, jours fériés), donc un
// nombre exact de semaines par mois serait une fausse précision. 4 est la
// valeur la plus simple à expliquer et à vérifier pour un directeur d'école.
const SEMAINES_PAR_MOIS = 4;

interface GroupeEnseignement {
  classeId: string;
  classeNom: string;
  niveauNom: string;
  matiereId: string;
  matiereNom: string;
  heuresParSemaine: number;
  tauxHoraire: number;
}

@Injectable()
export class PersonnelService {
  constructor(private prisma: PrismaService) {}

  findAll(ecoleId: string) {
    return this.prisma.personnel.findMany({ where: { ecoleId, actif: true }, orderBy: { nom: 'asc' } });
  }

  create(ecoleId: string, dto: CreatePersonnelDto) {
    return this.prisma.personnel.create({
      data: {
        ecoleId,
        nom: dto.nom,
        prenom: dto.prenom,
        fonction: dto.fonction,
        type: dto.type ?? 'ADMINISTRATIF',
        genre: dto.genre,
        matricule: dto.matricule,
        telephone: dto.telephone,
        email: dto.email,
        dateEmbauche: dto.dateEmbauche ? new Date(dto.dateEmbauche) : undefined,
        salaireBase: dto.salaireBase,
      },
    });
  }

  async update(ecoleId: string, id: string, dto: UpdatePersonnelDto) {
    await this.prisma.personnel.findFirstOrThrow({ where: { id, ecoleId } });
    return this.prisma.personnel.update({ where: { id }, data: dto });
  }

  // Désactiver un membre du personnel doit aussi couper son accès (compte lié)
  // et le retirer de l'emploi du temps actif : sinon il reste affiché comme
  // enseignant en poste sur des créneaux alors qu'il a quitté l'école. On
  // libère les créneaux (personnelId → null) plutôt que de les supprimer, pour
  // ne pas perdre la structure horaire/salle/matière — le créneau redevient
  // « à pourvoir » en attendant un remplaçant.
  async remove(ecoleId: string, id: string) {
    await this.prisma.personnel.findFirstOrThrow({ where: { id, ecoleId } });
    const [personnel] = await this.prisma.$transaction([
      this.prisma.personnel.update({ where: { id }, data: { actif: false } }),
      this.prisma.utilisateur.updateMany({ where: { personnelId: id }, data: { actif: false } }),
      this.prisma.creneau.updateMany({ where: { personnelId: id }, data: { personnelId: null } }),
    ]);
    return personnel;
  }

  async findOne(ecoleId: string, id: string) {
    return this.prisma.personnel.findFirstOrThrow({
      where: { id, ecoleId },
      include: {
        creneaux: {
          include: { classe: { include: { niveau: true } }, matiere: true, salle: true },
          orderBy: [{ jour: 'asc' }, { heureDebut: 'asc' }],
        },
      },
    });
  }

  // Regroupe les créneaux réels d'un enseignant par (classe, matière) : c'est
  // l'emploi du temps qui fait foi pour savoir qui enseigne quoi et combien
  // d'heures — il n'y a plus de déclaration séparée à maintenir à la main.
  private async groupesEnseignement(personnelId: string): Promise<GroupeEnseignement[]> {
    const creneaux = await this.prisma.creneau.findMany({
      where: { personnelId },
      include: { classe: { include: { niveau: true } }, matiere: true },
      orderBy: { classe: { nom: 'asc' } },
    });

    const groupes = new Map<string, GroupeEnseignement>();
    for (const c of creneaux) {
      const cle = `${c.classeId}:${c.matiereId}`;
      const [hDebutH, hDebutM] = c.heureDebut.split(':').map(Number);
      const [hFinH, hFinM] = c.heureFin.split(':').map(Number);
      const duree = hFinH + hFinM / 60 - (hDebutH + hDebutM / 60);

      const existant = groupes.get(cle);
      if (existant) {
        existant.heuresParSemaine += duree;
        if (!existant.tauxHoraire && c.tauxHoraire) existant.tauxHoraire = Number(c.tauxHoraire);
      } else {
        groupes.set(cle, {
          classeId: c.classeId,
          classeNom: c.classe.nom,
          niveauNom: c.classe.niveau.nom,
          matiereId: c.matiereId,
          matiereNom: c.matiere.nom,
          heuresParSemaine: duree,
          tauxHoraire: c.tauxHoraire ? Number(c.tauxHoraire) : 0,
        });
      }
    }
    return Array.from(groupes.values());
  }

  // Salaire de base d'un enseignant : Σ (heures/semaine × 4 × taux horaire),
  // déduit de son emploi du temps réel (voir groupesEnseignement).
  async salaireEnseignant(ecoleId: string, personnelId: string) {
    const personnel = await this.prisma.personnel.findFirst({ where: { id: personnelId, ecoleId } });
    if (!personnel) {
      throw new NotFoundException('Personnel introuvable');
    }

    const groupes = await this.groupesEnseignement(personnelId);

    const lignes = groupes.map((g) => {
      const heuresParMois = g.heuresParSemaine * SEMAINES_PAR_MOIS;
      return {
        classeId: g.classeId,
        matiereId: g.matiereId,
        classe: g.classeNom,
        niveau: g.niveauNom,
        matiere: g.matiereNom,
        heuresParMois,
        tauxHoraire: g.tauxHoraire,
        montant: heuresParMois * g.tauxHoraire,
      };
    });

    const totalHeures = lignes.reduce((acc, l) => acc + l.heuresParMois, 0);
    const salaireBase = lignes.reduce((acc, l) => acc + l.montant, 0);

    return {
      personnelId,
      type: personnel.type,
      nombreClasses: lignes.length,
      totalHeures,
      salaireBase,
      lignes,
    };
  }

  // Utilisé par le module Paie pour verrouiller la base d'un enseignant.
  async baseSalarialeMensuelle(ecoleId: string, personnelId: string) {
    const personnel = await this.prisma.personnel.findFirstOrThrow({ where: { id: personnelId, ecoleId } });
    if (personnel.type === 'ENSEIGNANT') {
      const calcul = await this.salaireEnseignant(ecoleId, personnelId);
      return { type: 'ENSEIGNANT' as const, salaireBase: calcul.salaireBase, totalHeures: calcul.totalHeures };
    }
    return {
      type: 'ADMINISTRATIF' as const,
      salaireBase: personnel.salaireBase ? Number(personnel.salaireBase) : 0,
      totalHeures: 0,
    };
  }

  // Lignes de base d'un enseignant pour un bulletin : une ligne par (classe,
  // matière) enseignée d'après l'emploi du temps réel, avec les heures du mois
  // ajustables (défaut = heures hebdomadaires réelles × 4).
  async lignesBaseEnseignant(
    ecoleId: string,
    personnelId: string,
    heuresParClasse?: { classeId: string; matiereId: string; heures: number }[],
  ) {
    await this.prisma.personnel.findFirstOrThrow({ where: { id: personnelId, ecoleId } });
    const groupes = await this.groupesEnseignement(personnelId);

    const override = new Map((heuresParClasse ?? []).map((h) => [`${h.classeId}:${h.matiereId}`, h.heures]));

    const lignes = groupes
      .map((g) => {
        const cle = `${g.classeId}:${g.matiereId}`;
        const heures = override.has(cle) ? (override.get(cle) as number) : g.heuresParSemaine * SEMAINES_PAR_MOIS;
        return {
          classeId: g.classeId,
          matiereId: g.matiereId,
          libelle: `Salaire base — ${g.classeNom} ${g.matiereNom} (${heures} h × ${g.tauxHoraire.toLocaleString('fr-FR').replace(/\u202f/g, ' ')})`,
          heures,
          taux: g.tauxHoraire,
          montant: heures * g.tauxHoraire,
        };
      })
      .filter((l) => l.montant > 0);

    const totalHeures = lignes.reduce((acc, l) => acc + l.heures, 0);
    const total = lignes.reduce((acc, l) => acc + l.montant, 0);
    return { lignes, totalHeures, total };
  }
}
