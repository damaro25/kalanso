import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { Regime } from '../generated/prisma/enums';
import { exigerAnneeOuverte } from '../common/annee-cloturee.util';
import { liste } from '../common/liste.util';

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

// Formations proposées par « Ajouter les formations habituelles » (fiche 2025-2026 : arabe et informatique
// gratuits pour les internes et semi-internes ; tarif de l'anglais à saisir).
export const FORMATIONS_HABITUELLES: { nom: string; tarifMensuel: number; regimesGratuits: Regime[] }[] = [
  { nom: 'Arabe', tarifMensuel: 25000, regimesGratuits: ['INTERNAT', 'SEMI_INTERNAT'] },
  { nom: 'Informatique', tarifMensuel: 50000, regimesGratuits: ['INTERNAT', 'SEMI_INTERNAT'] },
  { nom: 'Anglais', tarifMensuel: 0, regimesGratuits: [] },
];

export interface FormationInput {
  nom?: string;
  tarifMensuel?: number;
  regimesGratuits?: Regime[];
  actif?: boolean;
}

// Mois en cours au format AAAA-MM (mois facturé à l'inscription à une formation)
export function moisEnCours(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// « 2026-10 » -> « Octobre 2026 »
export function libelleMois(mois: string): string {
  const [annee, m] = mois.split('-').map(Number);
  return `${MOIS_LABELS[m - 1]} ${annee}`;
}

// Formations supplémentaires (arabe, anglais, informatique...) : catalogue de l'école, inscription des élèves
// pour l'année courante, et facturation au mois (une facture FORMATION par élève, formation et mois, jamais
// en double). Les paiements suivent le flux habituel (reçu numéroté, bordereau, budget).
@Injectable()
export class FormationsService {
  constructor(private prisma: PrismaService) {}

  // --- Catalogue ---

  catalogue(ecoleId: string) {
    return this.prisma.formationSupplementaire.findMany({
      where: { ecoleId },
      orderBy: [{ actif: 'desc' }, { nom: 'asc' }],
      include: { _count: { select: { inscriptions: { where: { dateFin: null } } } } },
    });
  }

  private verifier(dto: FormationInput, creation: boolean) {
    const nom = dto.nom?.trim();
    if ((creation || dto.nom !== undefined) && !nom) throw new BadRequestException('Le nom de la formation est requis');
    if (dto.tarifMensuel !== undefined && (!Number.isInteger(dto.tarifMensuel) || dto.tarifMensuel < 0)) {
      throw new BadRequestException('Le tarif mensuel doit être un nombre entier positif ou nul');
    }
    return nom;
  }

  private async nomLibre(ecoleId: string, nom: string, sauf?: string) {
    // Comparaison sans tenir compte de la casse, faite ici : SQLite (version bureau) ne connaît pas mode: 'insensitive'
    const formations = await this.prisma.formationSupplementaire.findMany({
      where: { ecoleId, ...(sauf ? { id: { not: sauf } } : {}) },
      select: { nom: true },
    });
    const existe = formations.find((f) => f.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'));
    if (existe) throw new BadRequestException(`La formation « ${nom} » existe déjà`);
  }

  async creer(ecoleId: string, dto: FormationInput) {
    const nom = this.verifier(dto, true)!;
    await this.nomLibre(ecoleId, nom);
    return this.prisma.formationSupplementaire.create({
      data: {
        ecoleId,
        nom,
        tarifMensuel: dto.tarifMensuel ?? 0,
        regimesGratuits: dto.regimesGratuits ?? [],
        actif: dto.actif ?? true,
      },
    });
  }

  private async formationDeLEcole(ecoleId: string, id: string) {
    const formation = await this.prisma.formationSupplementaire.findFirst({ where: { id, ecoleId } });
    if (!formation) throw new BadRequestException('Formation introuvable');
    return formation;
  }

  async modifier(ecoleId: string, id: string, dto: FormationInput) {
    await this.formationDeLEcole(ecoleId, id);
    const nom = this.verifier(dto, false);
    if (nom) await this.nomLibre(ecoleId, nom, id);
    return this.prisma.formationSupplementaire.update({
      where: { id },
      data: { nom, tarifMensuel: dto.tarifMensuel, regimesGratuits: dto.regimesGratuits, actif: dto.actif },
    });
  }

  // Suppression seulement si personne n'y a jamais été inscrit ni facturé ; sinon, la désactiver.
  async supprimer(ecoleId: string, id: string) {
    await this.formationDeLEcole(ecoleId, id);
    const [inscriptions, factures] = await Promise.all([
      this.prisma.inscriptionFormation.count({ where: { formationId: id } }),
      this.prisma.facture.count({ where: { formationId: id } }),
    ]);
    if (inscriptions > 0 || factures > 0) {
      throw new BadRequestException('Des élèves sont ou ont été inscrits à cette formation : désactivez-la plutôt');
    }
    return this.prisma.formationSupplementaire.delete({ where: { id } });
  }

  // Crée celles des formations habituelles qui manquent (rien n'est créé sans ce clic).
  async ajouterHabituelles(ecoleId: string) {
    const existantes = await this.prisma.formationSupplementaire.findMany({ where: { ecoleId }, select: { nom: true } });
    const noms = new Set(existantes.map((f) => f.nom.toLowerCase()));
    const manquantes = FORMATIONS_HABITUELLES.filter((f) => !noms.has(f.nom.toLowerCase()));
    if (manquantes.length > 0) {
      await this.prisma.formationSupplementaire.createMany({ data: manquantes.map((f) => ({ ecoleId, ...f })) });
    }
    return { ajoutees: manquantes.map((f) => f.nom) };
  }

  // --- Élève ---

  private async anneeCourante(ecoleId: string) {
    const annee =
      (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } })) ??
      (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } }));
    if (!annee) throw new BadRequestException('Aucune année scolaire définie');
    return annee;
  }

  private async regimeEleve(ecoleId: string, eleveId: string, anneeScolaireId: string): Promise<Regime | null> {
    const inscription =
      (await this.prisma.inscription.findFirst({ where: { ecoleId, eleveId, anneeScolaireId, statut: 'EN_COURS' } })) ??
      (await this.prisma.inscription.findFirst({ where: { ecoleId, eleveId, statut: 'EN_COURS' } }));
    return inscription?.regime ?? null;
  }

  // Formations de l'élève pour l'année courante, avec la gratuité selon son régime.
  async formationsEleve(ecoleId: string, eleveId: string) {
    const eleve = await this.prisma.eleve.findFirst({ where: { id: eleveId, ecoleId } });
    if (!eleve) throw new BadRequestException('Élève introuvable');
    const annee = await this.anneeCourante(ecoleId);
    const mois = moisEnCours();
    const [regime, inscriptions, facturesMois] = await Promise.all([
      this.regimeEleve(ecoleId, eleveId, annee.id),
      this.prisma.inscriptionFormation.findMany({
        where: { ecoleId, eleveId, anneeScolaireId: annee.id, dateFin: null },
        include: { formation: true },
        orderBy: { dateDebut: 'asc' },
      }),
      this.prisma.facture.findMany({
        where: { ecoleId, eleveId, type: 'FORMATION', moisFormation: mois, statut: { not: 'ANNULEE' } },
        select: { id: true, formationId: true, montantTotal: true, montantPaye: true },
      }),
    ]);
    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      regime,
      mois: { code: mois, libelle: libelleMois(mois) },
      formations: inscriptions.map((i) => {
        const gratuit = !!regime && liste<Regime>(i.formation.regimesGratuits).includes(regime);
        const f = (facturesMois ?? []).find((x) => x.formationId === i.formationId);
        return {
          // facture du mois en cours (créée à l'inscription ou par « Facturer le mois »), à encaisser comme les autres
          factureMois: f ? { id: f.id, montant: Number(f.montantTotal), paye: Number(f.montantPaye) } : null,
          inscriptionId: i.id,
          formationId: i.formationId,
          nom: i.formation.nom,
          dateDebut: i.dateDebut,
          tarifMensuel: i.formation.tarifMensuel,
          gratuit,
          montantMensuel: gratuit ? 0 : i.formation.tarifMensuel,
        };
      }),
    };
  }

  async inscrire(ecoleId: string, eleveId: string, formationId: string) {
    const eleve = await this.prisma.eleve.findFirst({ where: { id: eleveId, ecoleId } });
    if (!eleve) throw new BadRequestException('Élève introuvable');
    const formation = await this.formationDeLEcole(ecoleId, formationId);
    if (!formation.actif) throw new BadRequestException('Cette formation est désactivée');
    const annee = await this.anneeCourante(ecoleId);
    // Réinscription après une désinscription : on reprend la même ligne.
    await this.prisma.inscriptionFormation.upsert({
      where: { eleveId_formationId_anneeScolaireId: { eleveId, formationId, anneeScolaireId: annee.id } },
      create: { ecoleId, eleveId, formationId, anneeScolaireId: annee.id },
      update: { dateFin: null, dateDebut: new Date() },
    });
    // Le mois en cours est facturé tout de suite (sauf formation gratuite pour le régime de l'élève ou tarif nul) :
    // la facture apparaît sur la fiche, s'encaisse, et son paiement va dans la colonne « Formations » du bordereau.
    // Sans cela, rien n'était à payer tant que personne ne cliquait sur « Facturer le mois ».
    const facturation = annee.cloturee ? null : await this.facturerMois(ecoleId, moisEnCours(), eleveId);
    return { ...(await this.formationsEleve(ecoleId, eleveId)), facturation };
  }

  async desinscrire(ecoleId: string, eleveId: string, formationId: string) {
    const annee = await this.anneeCourante(ecoleId);
    const inscription = await this.prisma.inscriptionFormation.findFirst({
      where: { ecoleId, eleveId, formationId, anneeScolaireId: annee.id, dateFin: null },
    });
    if (!inscription) throw new BadRequestException("L'élève n'est pas inscrit à cette formation");
    await this.prisma.inscriptionFormation.update({ where: { id: inscription.id }, data: { dateFin: new Date() } });
    return this.formationsEleve(ecoleId, eleveId);
  }

  // --- Facturation ---

  // Facture le mois (AAAA-MM) pour chaque inscription active de l'année courante (ou d'un seul élève) :
  // une facture FORMATION par élève, formation et mois. Rien pour une formation gratuite (selon le régime) ou à
  // tarif nul ; rien non plus si la facture du mois existe déjà.
  async facturerMois(ecoleId: string, mois: string, eleveId?: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mois ?? '')) throw new BadRequestException('Mois invalide : le format attendu est AAAA-MM');
    const annee = await this.anneeCourante(ecoleId);
    await exigerAnneeOuverte(this.prisma, annee.id, 'y facturer des formations');
    const [a, m] = mois.split('-').map(Number);
    const debutMois = new Date(Date.UTC(a, m - 1, 1));
    const finMois = new Date(Date.UTC(a, m, 1));

    const inscriptions = await this.prisma.inscriptionFormation.findMany({
      where: {
        ecoleId,
        anneeScolaireId: annee.id,
        ...(eleveId ? { eleveId } : {}),
        dateDebut: { lt: finMois },
        OR: [{ dateFin: null }, { dateFin: { gte: debutMois } }],
        formation: { actif: true },
      },
      include: { formation: true },
    });
    const eleveIds = [...new Set(inscriptions.map((i) => i.eleveId))];
    const [inscriptionsClasse, dejaFacturees] = await Promise.all([
      eleveIds.length
        ? this.prisma.inscription.findMany({
            where: { ecoleId, eleveId: { in: eleveIds }, statut: 'EN_COURS' },
            select: { eleveId: true, regime: true, anneeScolaireId: true },
          })
        : [],
      eleveIds.length
        ? this.prisma.facture.findMany({
            where: { ecoleId, eleveId: { in: eleveIds }, moisFormation: mois, formationId: { not: null } },
            select: { eleveId: true, formationId: true },
          })
        : [],
    ]);
    const regimeParEleve = new Map<string, Regime>();
    for (const i of inscriptionsClasse) {
      if (i.anneeScolaireId === annee.id || !regimeParEleve.has(i.eleveId)) regimeParEleve.set(i.eleveId, i.regime);
    }
    const existe = new Set(dejaFacturees.map((f) => `${f.eleveId}|${f.formationId}`));

    let gratuites = 0;
    let deja = 0;
    const aCreer: {
      ecoleId: string;
      eleveId: string;
      anneeScolaireId: string;
      libelle: string;
      type: 'FORMATION';
      montantTotal: number;
      formationId: string;
      moisFormation: string;
      dateEcheance: Date;
    }[] = [];
    for (const i of inscriptions) {
      const regime = regimeParEleve.get(i.eleveId);
      if ((regime && liste<Regime>(i.formation.regimesGratuits).includes(regime)) || i.formation.tarifMensuel <= 0) {
        gratuites++;
        continue;
      }
      if (existe.has(`${i.eleveId}|${i.formationId}`)) {
        deja++;
        continue;
      }
      aCreer.push({
        ecoleId,
        eleveId: i.eleveId,
        anneeScolaireId: annee.id,
        libelle: `Formation ${i.formation.nom} — ${libelleMois(mois)}`,
        type: 'FORMATION',
        montantTotal: i.formation.tarifMensuel,
        formationId: i.formationId,
        moisFormation: mois,
        dateEcheance: new Date(finMois.getTime() - 24 * 60 * 60 * 1000),
      });
    }
    // Une par une : l'index unique (élève, formation, mois) écarte un doublon créé entre-temps (double clic
    // simultané) ; createMany({ skipDuplicates }) n'existe pas sous SQLite (version bureau).
    let count = 0;
    for (const data of aCreer) {
      try {
        await this.prisma.facture.create({ data });
        count++;
      } catch (e) {
        if ((e as { code?: string })?.code !== 'P2002') throw e;
      }
    }
    return { mois, creees: count, dejaFacturees: deja + (aCreer.length - count), gratuites };
  }
}
