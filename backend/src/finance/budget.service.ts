import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { codeSuppressionValide } from './code-suppression';
import type { Regime } from '../generated/prisma/enums';
import { liste } from '../common/liste.util';

// Colonnes du budget papier : octobre à juin, puis les vacances (juillet à septembre).
export const COLONNES_BUDGET = [
  'Octobre', 'Novembre', 'Décembre', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Vacances',
];
const NB_COLONNES = COLONNES_BUDGET.length;
const NB_MOIS_SCOLAIRES = 9; // l'écolage payé est réparti à parts égales d'octobre à juin

// Dans l'ordre de la feuille papier.
const REGIMES_BUDGET: { regime: Regime; libelle: string }[] = [
  { regime: 'EXTERNAT', libelle: 'Régime Externat' },
  { regime: 'INTERNAT', libelle: 'Régime Internat' },
  { regime: 'SEMI_INTERNAT', libelle: 'Régime Semi-Internat' },
  { regime: 'PENSIONNAT', libelle: 'Régime Pensionnat' },
];
const CYCLES_HABITUELS = ['Maternelle', 'Primaire'];

// Postes proposés pour démarrer un budget, ceux de la feuille papier.
export const POSTES_HABITUELS = [
  'Salaires', 'Loyer', 'Fournitures', 'Nourriture', 'Remboursement crédit', 'Eau et électricité', 'Nettoyage et gardien',
];

const estCreche = (niveau: string) => /cr[eè]che|garderie/i.test(niveau);
const somme = (valeurs: number[]) => valeurs.reduce((a, v) => a + v, 0);
const zeros = () => Array<number>(NB_COLONNES).fill(0);
const additionner = (a: number[], b: number[]) => a.map((v, i) => v + b[i]);

// Ligne d'encaissements : écolage payé de l'année réparti d'octobre à juin, au franc près ; le reste de la
// division va sur juin, pour que le total retombe exactement sur l'écolage payé.
function ligneEncaissement(libelle: string, annuel: number) {
  const mensuel = Math.floor(annuel / NB_MOIS_SCOLAIRES);
  const juin = annuel - mensuel * (NB_MOIS_SCOLAIRES - 1);
  const parMois = COLONNES_BUDGET.map((_, i) => (i < NB_MOIS_SCOLAIRES - 1 ? mensuel : i === NB_MOIS_SCOLAIRES - 1 ? juin : 0));
  return { libelle, parMois, total: somme(parMois) };
}

// Page « Budget de trésorerie » : reproduit le budget papier de l'école pour une année scolaire, en deux vues.
// Le RÉEL (vue principale, voir reel()) : tous les paiements, recettes, salaires et dépenses enregistrés.
// Le PRÉVISIONNEL :
//   - encaissements : écolage payé pour l'année (montants payés des factures d'écolage non annulées), par régime
//     de l'élève et par cycle de son niveau, la crèche/garderie à part ; réparti à parts égales d'octobre à juin
//   - décaissements : postes saisis (salaires, loyer...), un montant prévu par colonne
//   - trésorerie : FT = E − D ; TI = TF de la colonne précédente (0 au départ) ; TF = TI + FT
//   - réalisé : le réel ramené aux mêmes colonnes, pour comparer au prévu ; ce qui précède octobre compte en
//     octobre, ce qui suit juin en vacances
// Modifier ou supprimer un poste demande le code des dépenses (2026 par défaut, voir code-suppression.ts).
@Injectable()
export class BudgetService {
  constructor(private prisma: PrismaService) {}

  private async resoudreAnnee(ecoleId: string, anneeScolaireId?: string) {
    const annee = anneeScolaireId
      ? await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } })
      : ((await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } })) ??
        (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } })));
    if (!annee) throw new BadRequestException(anneeScolaireId ? 'Année scolaire invalide' : 'Aucune année scolaire définie');
    return annee;
  }

  // Budget réel : tout ce qui a été effectivement encaissé et décaissé, mois par mois, présenté comme le budget
  // papier. Colonnes : octobre à juin, plus « Avant octobre » / « Après juin » quand elles ne sont pas vides.
  //   - encaissements : tous les paiements des factures de l'année (formations supplémentaires sur leurs
  //     propres lignes), même encaissés hors période ; l'écolage par régime × cycle (crèche à part), les autres frais sur leurs
  //     lignes ; puis les autres recettes saisies (mouvements), par catégorie
  //   - décaissements : salaires (bulletins de paie des mois de l'année) et dépenses saisies, par catégorie
  //   - trésorerie : FT = E − D ; TI = TF de la colonne précédente (0 au départ) ; TF = TI + FT
  private async reel(ecoleId: string, annee: { id: string; dateDebut: Date; dateFin: Date }) {
    const debut = new Date(annee.dateDebut);
    const fin = new Date(annee.dateFin);
    fin.setDate(fin.getDate() + 1); // inclut toute la dernière journée

    // Octobre de la rentrée : une année qui démarre de juillet à décembre est celle de ce même octobre.
    const anneeOctobre = annee.dateDebut.getMonth() >= 6 ? annee.dateDebut.getFullYear() : annee.dateDebut.getFullYear() - 1;
    const rangOctobre = anneeOctobre * 12 + 9;
    const colonnes: { libelle: string; hors?: 'AVANT' | 'APRES' }[] = [
      { libelle: 'Avant octobre', hors: 'AVANT' },
      ...COLONNES_BUDGET.slice(0, NB_MOIS_SCOLAIRES).map((libelle) => ({ libelle })),
      { libelle: 'Après juin', hors: 'APRES' },
    ];
    const nb = colonnes.length;
    const colonneDe = (annee: number, mois: number) => {
      const decalage = annee * 12 + (mois - 1) - rangOctobre;
      return decalage < 0 ? 0 : decalage >= NB_MOIS_SCOLAIRES ? nb - 1 : decalage + 1;
    };
    const colonneDate = (d: Date) => colonneDe(d.getFullYear(), d.getMonth() + 1);

    // Mois civils couverts par l'année (pour les bulletins de paie)
    const moisAnnee: { annee: number; mois: number }[] = [];
    for (
      let cur = new Date(annee.dateDebut.getFullYear(), annee.dateDebut.getMonth(), 1);
      cur <= new Date(annee.dateFin.getFullYear(), annee.dateFin.getMonth(), 1);
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1)
    ) {
      moisAnnee.push({ annee: cur.getFullYear(), mois: cur.getMonth() + 1 });
    }

    const [paiements, mouvements, bulletins] = await Promise.all([
      this.prisma.paiement.findMany({
        // Un paiement appartient à l'année de sa facture (même règle que FinanceService.paiementsDeLAnnee)
        where: { ecoleId, facture: { anneeScolaireId: annee.id } },
        select: {
          montant: true,
          datePaiement: true,
          facture: { select: { eleveId: true, anneeScolaireId: true, type: true, formation: { select: { nom: true } } } },
        },
      }),
      this.prisma.mouvementFinancier.findMany({
        where: { ecoleId, date: { gte: debut, lt: fin } },
        select: { type: true, categorie: true, montant: true, date: true },
      }),
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, OR: moisAnnee.map((m) => ({ annee: m.annee, mois: m.mois })) },
        select: { mois: true, annee: true, netAPayer: true },
      }),
    ]);

    // Régime et niveau de chaque élève payeur : l'inscription de l'année de la facture, à défaut celle de
    // l'année du budget, à défaut une autre.
    const eleveIds = [...new Set(paiements.map((p) => p.facture.eleveId))];
    const inscriptions = eleveIds.length
      ? await this.prisma.inscription.findMany({
          where: { ecoleId, eleveId: { in: eleveIds } },
          select: {
            eleveId: true,
            anneeScolaireId: true,
            regime: true,
            classe: { select: { niveau: { select: { nom: true, cycle: true } } } },
          },
        })
      : [];
    type Insc = (typeof inscriptions)[number];
    const parEleveEtAnnee = new Map<string, Insc>();
    const parEleve = new Map<string, Insc>();
    for (const i of inscriptions) {
      parEleveEtAnnee.set(`${i.eleveId}|${i.anneeScolaireId}`, i);
      if (i.anneeScolaireId === annee.id || !parEleve.has(i.eleveId)) parEleve.set(i.eleveId, i);
    }

    const lignes = new Map<string, number[]>();
    const ajouter = (cle: string, i: number, montant: number) => {
      const l = lignes.get(cle) ?? Array<number>(nb).fill(0);
      l[i] += montant;
      lignes.set(cle, l);
    };
    const cycles = new Set(CYCLES_HABITUELS);
    const formations = new Set<string>();
    let totalPaiements = 0;
    for (const p of paiements) {
      if (p.facture.anneeScolaireId !== annee.id) continue; // garde-fou (la requête filtre déjà)
      const montant = Number(p.montant);
      totalPaiements += montant;
      const i = colonneDate(p.datePaiement);
      if (p.facture.type === 'FORMATION') {
        formations.add(p.facture.formation?.nom ?? 'Autre');
        ajouter(`FORMATION|${p.facture.formation?.nom ?? 'Autre'}`, i, montant);
        continue;
      }
      if (p.facture.type === 'INSCRIPTION') {
        ajouter('INSCRIPTION', i, montant);
        continue;
      }
      if (p.facture.type === 'ASSURANCE') {
        ajouter('ASSURANCE', i, montant);
        continue;
      }
      if (p.facture.type !== 'ECOLAGE') {
        ajouter('AUTRES_FRAIS', i, montant);
        continue;
      }
      const insc = parEleveEtAnnee.get(`${p.facture.eleveId}|${p.facture.anneeScolaireId}`) ?? parEleve.get(p.facture.eleveId);
      if (!insc) {
        ajouter('ECOLAGE_SANS_CLASSE', i, montant);
        continue;
      }
      const niveau = insc.classe.niveau;
      if (estCreche(niveau.nom)) {
        ajouter('CRECHE', i, montant);
        continue;
      }
      const cycle = niveau.cycle?.trim() || 'Autre';
      cycles.add(cycle);
      ajouter(`${insc.regime}|${cycle}`, i, montant);
    }

    const depenses = new Map<string, number[]>();
    const recettes = new Map<string, number[]>();
    const cumuler = (m: Map<string, number[]>, cle: string, i: number, montant: number) => {
      const l = m.get(cle) ?? Array<number>(nb).fill(0);
      l[i] += montant;
      m.set(cle, l);
    };
    cumuler(depenses, 'Salaires', 0, 0); // toujours présent, comme sur le budget papier
    for (const b of bulletins) cumuler(depenses, 'Salaires', colonneDe(b.annee, b.mois), Number(b.netAPayer));
    for (const m of mouvements) {
      cumuler(m.type === 'RECETTE' ? recettes : depenses, m.categorie, colonneDate(m.date), Number(m.montant));
    }

    // Les colonnes hors période ne sont gardées que si elles contiennent quelque chose.
    const toutes = [...lignes.values(), ...depenses.values(), ...recettes.values()];
    const garder = colonnes.map((c, i) => !c.hors || toutes.some((l) => l[i] !== 0));
    const reduire = (v: number[]) => v.filter((_, i) => garder[i]);
    const ligne = (libelle: string, valeurs?: number[]) => {
      const parMois = reduire(valeurs ?? Array<number>(nb).fill(0));
      return { libelle, parMois, total: somme(parMois) };
    };
    const nbGarde = garder.filter(Boolean).length;
    const zerosGarde = () => Array<number>(nbGarde).fill(0);
    const totalDe = (ls: { parMois: number[] }[]) => {
      const parMois = ls.reduce((acc, l) => additionner(acc, l.parMois), zerosGarde());
      return { parMois, total: somme(parMois) };
    };

    const cyclesOrdonnes = [
      ...CYCLES_HABITUELS,
      ...[...cycles].filter((c) => !CYCLES_HABITUELS.includes(c)).sort((a, b) => a.localeCompare(b)),
    ];
    const regimes = REGIMES_BUDGET.map(({ regime, libelle }) => {
      const ls = cyclesOrdonnes.map((cycle) => ligne(cycle, lignes.get(`${regime}|${cycle}`)));
      return { regime, libelle, lignes: ls, sousTotal: totalDe(ls) };
    });
    const creche = ligne('Crèche / Garderie', lignes.get('CRECHE'));
    const autres = [
      ligne("Frais d'inscription / réinscription", lignes.get('INSCRIPTION')),
      ligne('T-shirt', lignes.get('ASSURANCE')),
      // Formations supplémentaires (arabe, anglais, informatique...), une ligne par formation
      ...[...formations].sort((a, b) => a.localeCompare(b)).map((nom) => ligne(`Formation : ${nom}`, lignes.get(`FORMATION|${nom}`))),
      ligne('Autres frais élèves (T-shirt, cantine...)', lignes.get('AUTRES_FRAIS')),
      ...(lignes.has('ECOLAGE_SANS_CLASSE') ? [ligne('Écolage (élève sans classe)', lignes.get('ECOLAGE_SANS_CLASSE'))] : []),
      ...[...recettes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, v]) => ligne(`Recette : ${cat}`, v)),
    ];
    const totalEncaisse = totalDe([...regimes.map((r) => r.sousTotal), creche, ...autres]);

    const lignesDepenses = [...depenses.entries()]
      .sort(([a], [b]) => (a === 'Salaires' ? -1 : b === 'Salaires' ? 1 : a.localeCompare(b)))
      .map(([cat, v]) => ligne(cat, v));
    const totalDecaisse = totalDe(lignesDepenses);

    const flux = totalEncaisse.parMois.map((e, i) => e - totalDecaisse.parMois[i]);
    const initiale: number[] = [];
    const finale: number[] = [];
    flux.forEach((ft, i) => {
      initiale.push(i === 0 ? 0 : finale[i - 1]);
      finale.push(initiale[i] + ft);
    });

    const colonnesGardees = colonnes.filter((_, i) => garder[i]);
    return {
      colonnes: colonnesGardees,
      encaissements: { regimes, creche, autres, totalPaiements, total: totalEncaisse },
      decaissements: { lignes: lignesDepenses, total: totalDecaisse },
      tresorerie: {
        encaissements: totalEncaisse.parMois,
        decaissements: totalDecaisse.parMois,
        flux,
        initiale,
        finale,
        totalEncaissements: totalEncaisse.total,
        totalDecaissements: totalDecaisse.total,
        benefice: somme(flux),
      },
      // Ramené aux 10 colonnes du prévisionnel : avant octobre compte en octobre, après juin en vacances.
      ramener: (valeurs: number[]) => {
        const r = zeros();
        colonnesGardees.forEach((c, k) => {
          const i = c.hors === 'AVANT' ? 0 : c.hors === 'APRES' ? NB_COLONNES - 1 : COLONNES_BUDGET.indexOf(c.libelle);
          r[i] += valeurs[k];
        });
        return r;
      },
    };
  }

  async budget(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const [factures, inscriptions, postes, reel] = await Promise.all([
      this.prisma.facture.findMany({
        where: { ecoleId, anneeScolaireId: annee.id, type: 'ECOLAGE', statut: { not: 'ANNULEE' } },
        select: { eleveId: true, montantPaye: true },
      }),
      this.prisma.inscription.findMany({
        where: { ecoleId, anneeScolaireId: annee.id },
        select: { eleveId: true, regime: true, classe: { select: { niveau: { select: { nom: true, cycle: true } } } } },
      }),
      this.prisma.budgetDepense.findMany({
        where: { ecoleId, anneeScolaireId: annee.id },
        orderBy: [{ ordre: 'asc' }, { createdAt: 'asc' }],
      }),
      this.reel(ecoleId, annee),
    ]);

    const inscriptionParEleve = new Map(inscriptions.map((i) => [i.eleveId, i]));
    const annuel = new Map<string, number>();
    const cycles = new Set(CYCLES_HABITUELS);
    for (const f of factures) {
      const i = inscriptionParEleve.get(f.eleveId);
      if (!i) continue; // facture d'un élève sans inscription cette année : rien à ventiler
      const niveau = i.classe.niveau;
      const cycle = niveau.cycle?.trim() || 'Autre';
      const cle = estCreche(niveau.nom) ? 'CRECHE' : `${i.regime}|${cycle}`;
      if (!estCreche(niveau.nom)) cycles.add(cycle);
      annuel.set(cle, (annuel.get(cle) ?? 0) + Number(f.montantPaye));
    }
    const cyclesOrdonnes = [
      ...CYCLES_HABITUELS,
      ...[...cycles].filter((c) => !CYCLES_HABITUELS.includes(c)).sort((a, b) => a.localeCompare(b)),
    ];

    const regimes = REGIMES_BUDGET.map(({ regime, libelle }) => {
      const lignes = cyclesOrdonnes.map((cycle) => ligneEncaissement(cycle, annuel.get(`${regime}|${cycle}`) ?? 0));
      const sousTotal = lignes.reduce((acc, l) => additionner(acc, l.parMois), zeros());
      return { regime, libelle, lignes, sousTotal: { parMois: sousTotal, total: somme(sousTotal) } };
    });
    const creche = ligneEncaissement('Crèche / Garderie', annuel.get('CRECHE') ?? 0);
    const totalEncaisse = regimes.reduce((acc, r) => additionner(acc, r.sousTotal.parMois), creche.parMois);

    const lignesDepenses = postes.map((p) => {
      const montants = COLONNES_BUDGET.map((_, i) => Number(liste<unknown>(p.montants)[i] ?? 0));
      return { id: p.id, poste: p.poste, ordre: p.ordre, montants, total: somme(montants) };
    });
    const totalDecaisse = lignesDepenses.reduce((acc, l) => additionner(acc, l.montants), zeros());

    const flux = totalEncaisse.map((e, i) => e - totalDecaisse[i]);
    const initiale: number[] = [];
    const finale: number[] = [];
    flux.forEach((ft, i) => {
      initiale.push(i === 0 ? 0 : finale[i - 1]);
      finale.push(initiale[i] + ft);
    });

    const { ramener, ...vueReelle } = reel;
    const realiseEnc = ramener(reel.tresorerie.encaissements);
    const realiseDec = ramener(reel.tresorerie.decaissements);
    const realiseFinale: number[] = [];
    realiseEnc.forEach((e, i) => realiseFinale.push((i === 0 ? 0 : realiseFinale[i - 1]) + e - realiseDec[i]));

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      reel: vueReelle,
      prevision: {
        colonnes: COLONNES_BUDGET,
        encaissements: { regimes, creche, total: { parMois: totalEncaisse, total: somme(totalEncaisse) } },
        decaissements: { lignes: lignesDepenses, total: { parMois: totalDecaisse, total: somme(totalDecaisse) } },
        tresorerie: {
          encaissements: totalEncaisse,
          decaissements: totalDecaisse,
          flux,
          initiale,
          finale,
          totalEncaissements: somme(totalEncaisse),
          totalDecaissements: somme(totalDecaisse),
          benefice: somme(flux),
        },
        realise: {
          encaissements: realiseEnc,
          decaissements: realiseDec,
          finale: realiseFinale,
          totalEncaissements: somme(realiseEnc),
          totalDecaissements: somme(realiseDec),
          ecartEncaissements: realiseEnc.map((v, i) => v - totalEncaisse[i]),
        },
      },
    };
  }

  private verifierMontants(montants: number[]) {
    const valides =
      Array.isArray(montants) &&
      montants.length === NB_COLONNES &&
      montants.every((m) => typeof m === 'number' && Number.isFinite(m) && m >= 0);
    if (!valides) throw new BadRequestException(`Il faut ${NB_COLONNES} montants positifs ou nuls (octobre à juin, puis vacances)`);
  }

  private verifierCode(code?: string) {
    // 403 et non 401 : le client déconnecte l'utilisateur sur un 401.
    if (!codeSuppressionValide(code)) {
      throw new ForbiddenException(code ? 'Code incorrect' : 'Le code est requis pour modifier ou supprimer une dépense du budget');
    }
  }

  private async posteDeLEcole(ecoleId: string, id: string) {
    const poste = await this.prisma.budgetDepense.findFirst({ where: { id, ecoleId } });
    if (!poste) throw new BadRequestException('Poste introuvable');
    return poste;
  }

  async ajouterPoste(ecoleId: string, dto: { anneeScolaireId?: string; poste: string; montants: number[] }) {
    const annee = await this.resoudreAnnee(ecoleId, dto.anneeScolaireId);
    const poste = dto.poste?.trim();
    if (!poste) throw new BadRequestException('Le nom du poste est requis');
    this.verifierMontants(dto.montants);
    const dernier = await this.prisma.budgetDepense.findFirst({
      where: { ecoleId, anneeScolaireId: annee.id },
      orderBy: { ordre: 'desc' },
    });
    return this.prisma.budgetDepense.create({
      data: { ecoleId, anneeScolaireId: annee.id, poste, ordre: (dernier?.ordre ?? 0) + 1, montants: dto.montants },
    });
  }

  // Crée les postes de la feuille papier (montants à 0) pour une année qui n'en a encore aucun.
  async ajouterPostesHabituels(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const existants = await this.prisma.budgetDepense.count({ where: { ecoleId, anneeScolaireId: annee.id } });
    if (existants > 0) throw new BadRequestException('Cette année a déjà des postes de dépenses');
    await this.prisma.budgetDepense.createMany({
      data: POSTES_HABITUELS.map((poste, i) => ({ ecoleId, anneeScolaireId: annee.id, poste, ordre: i + 1, montants: zeros() })),
    });
    return this.budget(ecoleId, annee.id);
  }

  async modifierPoste(ecoleId: string, id: string, dto: { poste?: string; montants?: number[] }, code?: string) {
    await this.posteDeLEcole(ecoleId, id);
    this.verifierCode(code);
    const poste = dto.poste?.trim();
    if (dto.poste !== undefined && !poste) throw new BadRequestException('Le nom du poste est requis');
    if (dto.montants !== undefined) this.verifierMontants(dto.montants);
    return this.prisma.budgetDepense.update({ where: { id }, data: { poste, montants: dto.montants } });
  }

  async supprimerPoste(ecoleId: string, id: string, code?: string) {
    await this.posteDeLEcole(ecoleId, id);
    this.verifierCode(code);
    return this.prisma.budgetDepense.delete({ where: { id } });
  }
}
