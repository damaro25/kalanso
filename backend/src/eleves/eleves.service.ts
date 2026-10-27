import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from '../finances/factures.service';
import type { Regime } from '../generated/prisma/enums';
import { UpdateEleveDto } from './dto/eleve.dto';
import { CreateParentTuteurDto, LinkParentDto } from './dto/parent-tuteur.dto';
import { CreateInscriptionDto } from './dto/inscription.dto';
import { enregistrerFiliation, type PersonneFiliation } from './filiation.util';
import { exigerAnneeOuverte } from '../common/annee-cloturee.util';
import { codeSuppressionValide } from '../finance/code-suppression';
import { rmSync } from 'fs';
import { basename, join } from 'path';
import { DOSSIER_PHOTOS } from '../cartes-scolaires/photo-upload.config';

@Injectable()
export class ElevesService {
  constructor(
    private prisma: PrismaService,
    private facturesService: FacturesService,
  ) {}

  // `classeIds` non nul : périmètre d'un enseignant. On ne renvoie alors que les élèves inscrits dans ces classes,
  // sans leur adresse personnelle, inutile pour enseigner.
  // Régime et classe de l'élève : ceux de son inscription en cours, de préférence sur l'année courante.
  // Filtres : classe (inscription en cours dans cette classe) et régime.
  async findAll(
    ecoleId: string,
    classeIds: string[] | null = null,
    filtres: { classeId?: string; regime?: Regime } = {},
  ) {
    const classeFiltre = filtres.classeId ?? (classeIds ? { in: classeIds } : undefined);
    const eleves = await this.prisma.eleve.findMany({
      where: {
        ecoleId,
        actif: true,
        ...(classeFiltre || filtres.regime
          ? { inscriptions: { some: { statut: 'EN_COURS', classeId: classeFiltre, regime: filtres.regime } } }
          : {}),
      },
      include: {
        inscriptions: {
          where: { statut: 'EN_COURS' },
          select: {
            regime: true,
            anneeScolaire: { select: { courante: true } },
            classe: { select: { id: true, nom: true, niveau: { select: { nom: true } } } },
          },
        },
      },
      orderBy: { nom: 'asc' },
    });
    return eleves
      .map(({ inscriptions, ...eleve }) => {
        const inscription = inscriptions.find((i) => i.anneeScolaire.courante) ?? inscriptions[0];
        return {
          ...eleve,
          regime: inscription?.regime ?? null,
          classe: inscription?.classe
            ? { id: inscription.classe.id, nom: inscription.classe.nom, niveau: inscription.classe.niveau.nom }
            : null,
        };
      })
      .filter((e) => !filtres.regime || e.regime === filtres.regime)
      .map((e) => {
        if (!classeIds) return e;
        const { adresse: _adresse, ...sansAdresse } = e;
        return sansAdresse;
      });
  }

  async update(ecoleId: string, id: string, dto: UpdateEleveDto) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id, ecoleId } });
    // Champ vidé dans le formulaire : valeur effacée (null) ; nom et prénom restent obligatoires.
    const optionnel = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    if (dto.nom !== undefined && !dto.nom.trim()) throw new BadRequestException("Le nom de l'élève est requis");
    if (dto.prenom !== undefined && !dto.prenom.trim()) throw new BadRequestException("Le prénom de l'élève est requis");
    return this.prisma.eleve.update({
      where: { id },
      data: {
        nom: dto.nom?.trim(),
        prenom: dto.prenom?.trim(),
        genre: dto.genre,
        matricule: optionnel(dto.matricule),
        lieuNaissance: optionnel(dto.lieuNaissance),
        adresse: optionnel(dto.adresse),
        dateNaissance: dto.dateNaissance === undefined ? undefined : dto.dateNaissance ? new Date(dto.dateNaissance) : null,
      },
    });
  }

  // Ce que la suppression définitive d'un élève emporte, pour l'afficher avant confirmation.
  async apercuSuppression(ecoleId: string, id: string) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id, ecoleId } });
    const [factures, paiements, notes, absences, inscriptions, formations, emprunts, messages, demandes] = await Promise.all([
      this.prisma.facture.count({ where: { eleveId: id } }),
      this.prisma.paiement.count({ where: { facture: { eleveId: id } } }),
      this.prisma.note.count({ where: { eleveId: id } }),
      this.prisma.absence.count({ where: { eleveId: id } }),
      this.prisma.inscription.count({ where: { eleveId: id } }),
      this.prisma.inscriptionFormation.count({ where: { eleveId: id } }),
      this.prisma.emprunt.count({ where: { eleveId: id } }),
      this.prisma.messageParent.count({ where: { eleveId: id } }),
      this.prisma.demandeInscription.count({ where: { eleveId: id } }),
    ]);
    return { factures, paiements, notes, absences, inscriptions, formations, emprunts, messages, demandes };
  }

  // Suppression définitive d'un élève et de tout ce qui le concerne : factures, paiements (et donc reçus), notes
  // (et donc bulletins), absences, inscriptions, formations, emprunts, messages, demande d'admission et ses
  // documents, parents qui ne sont liés à aucun autre élève, photo. Tout ou rien (une transaction).
  // Le code de suppression à 4 chiffres est exigé (403 et non 401 : un 401 déconnecterait).
  async remove(ecoleId: string, id: string, code?: string) {
    const eleve = await this.prisma.eleve.findFirstOrThrow({ where: { id, ecoleId } });
    if (!codeSuppressionValide(code)) {
      throw new ForbiddenException(code ? 'Code de suppression incorrect' : 'Le code de suppression est requis pour supprimer un élève');
    }
    const bilan = await this.apercuSuppression(ecoleId, id);
    await this.prisma.$transaction(
      async (tx) => {
        const liensParents = await tx.eleveParent.findMany({ where: { eleveId: id } });
        await tx.transactionMobileMoney.deleteMany({ where: { facture: { eleveId: id } } });
        await tx.paiement.deleteMany({ where: { facture: { eleveId: id } } });
        await tx.paiementAnnule.deleteMany({ where: { eleveId: id } });
        await tx.facture.deleteMany({ where: { eleveId: id } });
        await tx.note.deleteMany({ where: { eleveId: id } });
        await tx.absence.deleteMany({ where: { eleveId: id } });
        await tx.emprunt.deleteMany({ where: { eleveId: id } });
        await tx.messageParent.deleteMany({ where: { eleveId: id } });
        await tx.inscriptionFormation.deleteMany({ where: { eleveId: id } });
        await tx.inscription.deleteMany({ where: { eleveId: id } });
        await tx.eleveParent.deleteMany({ where: { eleveId: id } });
        // Parents liés à aucun autre élève (une fratrie garde ses parents)
        for (const lien of liensParents) {
          const autre = await tx.eleveParent.findFirst({ where: { parentTuteurId: lien.parentTuteurId } });
          if (!autre) {
            await tx.messageParent.deleteMany({ where: { parentTuteurId: lien.parentTuteurId } });
            await tx.parentTuteur.delete({ where: { id: lien.parentTuteurId } });
          }
        }
        // Demande(s) d'admission de l'élève, leur historique d'annulation et leurs documents (cascade)
        const demandes = await tx.demandeInscription.findMany({ where: { eleveId: id }, select: { id: true } });
        const idsDemandes = demandes.map((d) => d.id);
        if (idsDemandes.length) {
          await tx.annulationAdmission.deleteMany({ where: { demandeId: { in: idsDemandes } } });
          await tx.demandeInscription.deleteMany({ where: { id: { in: idsDemandes } } });
        }
        await tx.eleve.delete({ where: { id } });
      },
      { timeout: 60_000 },
    );
    // Photo de l'élève (fichier) : après la transaction, sans bloquer si elle a déjà disparu
    if (eleve.photoUrl) {
      try {
        rmSync(join(DOSSIER_PHOTOS, basename(eleve.photoUrl)), { force: true });
      } catch {
        // fichier absent ou verrouillé : sans conséquence
      }
    }
    return { supprime: true, ...bilan };
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

    // Paiements annulés par le fondateur : affichés dans l'historique, barrés, avec le motif
    const paiementsAnnules = await this.prisma.paiementAnnule.findMany({ where: { ecoleId, eleveId: id }, orderBy: { annuleLe: 'desc' } });

    const solde = eleve.factures.reduce(
      (acc, f) => (f.statut === 'ANNULEE' ? acc : acc + (Number(f.montantTotal) - Number(f.montantPaye))),
      0,
    );

    return { ...eleve, absencesCount, solde, paiementsAnnules };
  }

  // Fiche d'enseignant : limitée à l'identité, à la classe et aux absences (les notes s'obtiennent par le bulletin).
  // Ni factures, ni solde, ni parents, ni origine de l'admission, ni adresse.
  async ficheRestreinte(ecoleId: string, id: string) {
    const { adresse: _adresse, ...eleve } = await this.prisma.eleve.findFirstOrThrow({
      where: { id, ecoleId },
      include: { inscriptions: { where: { statut: 'EN_COURS' }, include: { classe: { include: { niveau: true } } } } },
    });
    const anneeCourante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const absencesCount = await this.prisma.absence.count({
      where: {
        eleveId: id,
        statut: { in: ['ABSENT', 'RETARD'] },
        ...(anneeCourante ? { anneeScolaireId: anneeCourante.id } : {}),
      },
    });
    return { ...eleve, absencesCount };
  }

  findAllParents(ecoleId: string) {
    return this.prisma.parentTuteur.findMany({ where: { ecoleId }, orderBy: { nom: 'asc' } });
  }

  createParent(ecoleId: string, dto: CreateParentTuteurDto) {
    return this.prisma.parentTuteur.create({ data: { ecoleId, ...dto } });
  }

  // Père et mère : `undefined` laisse inchangé, null ou personne vide retire le lien.
  async majFiliation(
    ecoleId: string,
    eleveId: string,
    dto: {
      pere?: PersonneFiliation | null;
      mere?: PersonneFiliation | null;
      contact?: { prenom: string; nom: string; telephone?: string; email?: string; lien?: string };
    },
  ) {
    const eleve = await this.prisma.eleve.findFirst({ where: { id: eleveId, ecoleId } });
    if (!eleve) throw new BadRequestException('Élève introuvable');
    const contact = dto.contact && {
      prenom: dto.contact.prenom.trim(),
      nom: dto.contact.nom.trim(),
      telephone: dto.contact.telephone?.trim() || null,
      email: dto.contact.email?.trim() || null,
    };
    if (contact && (!contact.prenom || !contact.nom)) throw new BadRequestException('Prénom et nom du parent / tuteur requis');
    await this.prisma.$transaction(async (tx) => {
      if (contact) {
        const lien = dto.contact!.lien?.trim() || 'Parent';
        const existant = await tx.eleveParent.findFirst({ where: { eleveId, contactPrincipal: true } });
        if (existant) {
          await tx.parentTuteur.update({ where: { id: existant.parentTuteurId }, data: contact });
          await tx.eleveParent.update({ where: { id: existant.id }, data: { lien } });
        } else {
          const parent = await tx.parentTuteur.create({ data: { ecoleId, ...contact } });
          await tx.eleveParent.create({ data: { eleveId, parentTuteurId: parent.id, lien, contactPrincipal: true } });
        }
      }
      if (dto.pere !== undefined) await enregistrerFiliation(tx, ecoleId, eleveId, 'Père', dto.pere);
      if (dto.mere !== undefined) await enregistrerFiliation(tx, ecoleId, eleveId, 'Mère', dto.mere);
    });
    return this.prisma.eleveParent.findMany({ where: { eleveId }, include: { parentTuteur: true } });
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
    await exigerAnneeOuverte(this.prisma, anneeScolaireId, 'y inscrire un élève ou changer son inscription');

    const existante = await this.prisma.inscription.findUnique({
      where: { eleveId_anneeScolaireId: { eleveId: dto.eleveId, anneeScolaireId } },
      include: { classe: true },
    });
    if (existante && dto.regime && dto.regime !== existante.regime) {
      await this.facturesService.annulerEcolageRegime(
        ecoleId,
        dto.eleveId,
        anneeScolaireId,
        existante.classe.niveauId,
        existante.regime,
      );
    }

    const inscription = await this.prisma.inscription.upsert({
      where: { eleveId_anneeScolaireId: { eleveId: dto.eleveId, anneeScolaireId } },
      update: { classeId: classe.id, regime: dto.regime },
      create: {
        ecoleId,
        eleveId: dto.eleveId,
        classeId: classe.id,
        anneeScolaireId,
        regime: dto.regime,
      },
    });

    await this.facturesService.genererFacturesEnrolement(ecoleId, dto.eleveId, classe.id, anneeScolaireId);

    return inscription;
  }
}
