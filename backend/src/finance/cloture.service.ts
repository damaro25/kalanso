import { BadRequestException, ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from '../finances/factures.service';
import { codeSuppressionValide } from './code-suppression';
import { montantFraisInscription } from '../finances/inscription.util';

export type ModeTarifs = 'IDENTIQUES' | 'AJUSTES' | 'AUCUN';

export interface OptionsCloture {
  anneeId?: string; // année à clôturer (défaut : la courante)
  // année suivante : existante, ou à créer (libellé et dates)
  suivanteId?: string;
  suivanteLibelle?: string;
  suivanteDebut?: string; // AAAA-MM-JJ
  suivanteFin?: string;
  copierClasses?: boolean; // défaut oui
  tarifs?: ModeTarifs; // défaut IDENTIQUES
  ajustementPct?: number; // pour AJUSTES : +5 = +5 %
  decalerEcheances?: boolean; // défaut oui (+1 an)
  fraisReinscription?: number | null; // montant de réinscription imposé à tous les niveaux ; vide : celui de l'année clôturée
  reinscrire?: boolean; // défaut oui : niveau supérieur, même régime
  genererFactures?: boolean; // défaut oui
  rendreCourante?: boolean; // défaut oui
}

type Client = any; // PrismaService ou client de transaction

const plusUnAn = (d: Date) => new Date(Date.UTC(d.getUTCFullYear() + 1, d.getUTCMonth(), d.getUTCDate()));
const iso = (d: Date) => d.toISOString().slice(0, 10);

// Libellé « 2026-2027 » -> « 2027-2028 » ; sinon l'année de début + 1.
export function libelleSuivant(libelle: string, debut: Date): string {
  const m = /^(\d{4})\s*[-/]\s*(\d{4})$/.exec(libelle.trim());
  if (m) return `${Number(m[1]) + 1}-${Number(m[2]) + 1}`;
  const a = debut.getUTCFullYear() + 1;
  return `${a}-${a + 1}`;
}

// Montant ajusté d'un pourcentage, arrondi au millier de francs (les tarifs sont en milliers).
export function ajuster(montant: number, pct: number): number {
  if (!pct) return montant;
  return Math.max(Math.round((montant * (1 + pct / 100)) / 1000) * 1000, 0);
}

// Clôture d'une année scolaire et initialisation de la suivante (Finances > Clôture d'année) :
//   1. contrôles (lecture seule) : impayés qui resteront exigibles, paiements, inscrits, cohérence des factures
//      et des reçus, ce qui existe déjà dans l'année suivante
//   2. aperçu chiffré : classes, tarifs, frais et réinscriptions qui seront créés, total facturé
//   3. exécution (code de sécurité) dans une seule transaction : année suivante, classes, tarifs (identiques, ajustés
//      ou non recopiés, échéances décalées d'un an), frais, passage des élèves au niveau supérieur avec le même
//      régime (ceux de la dernière classe sortent), factures, année courante, clôture. Idempotente : relancée,
//      elle ne recrée rien de ce qui existe déjà.
// Une année clôturée n'accepte plus de factures, d'inscriptions ni de changement de tarifs (voir
// common/annee-cloturee.util.ts) ; les paiements des arriérés restent possibles.
@Injectable()
export class ClotureService {
  private readonly logger = new Logger('Cloture');

  constructor(private prisma: PrismaService) {}

  private defauts(o: OptionsCloture) {
    return {
      copierClasses: o.copierClasses ?? true,
      tarifs: (o.tarifs ?? 'IDENTIQUES') as ModeTarifs,
      ajustementPct: o.tarifs === 'AJUSTES' ? Number(o.ajustementPct ?? 0) : 0,
      decalerEcheances: o.decalerEcheances ?? true,
      fraisReinscription: o.fraisReinscription ?? null,
      reinscrire: o.reinscrire ?? true,
      genererFactures: o.genererFactures ?? true,
      rendreCourante: o.rendreCourante ?? true,
    };
  }

  private async anneeACloturer(client: Client, ecoleId: string, anneeId?: string) {
    const annee = anneeId
      ? await client.anneeScolaire.findFirst({ where: { id: anneeId, ecoleId } })
      : await client.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (!annee) throw new BadRequestException(anneeId ? 'Année scolaire invalide' : "Aucune année courante : choisissez l'année à clôturer");
    return annee;
  }

  // Année suivante existante (par id, ou par libellé), ou description de celle à créer.
  private async anneeSuivante(client: Client, ecoleId: string, annee: any, o: OptionsCloture) {
    if (o.suivanteId) {
      const s = await client.anneeScolaire.findFirst({ where: { id: o.suivanteId, ecoleId } });
      if (!s) throw new BadRequestException('Année suivante invalide');
      if (s.id === annee.id) throw new BadRequestException("L'année suivante doit être différente de l'année clôturée");
      if (s.dateDebut <= annee.dateDebut) throw new BadRequestException("L'année suivante doit commencer après l'année clôturée");
      return { existante: s, aCreer: null };
    }
    const libelle = o.suivanteLibelle?.trim() || libelleSuivant(annee.libelle, annee.dateDebut);
    const existante = await client.anneeScolaire.findFirst({ where: { ecoleId, libelle } });
    if (existante) return { existante, aCreer: null };
    const dateDebut = o.suivanteDebut ? new Date(o.suivanteDebut) : plusUnAn(annee.dateDebut);
    const dateFin = o.suivanteFin ? new Date(o.suivanteFin) : plusUnAn(annee.dateFin);
    if (Number.isNaN(dateDebut.getTime()) || Number.isNaN(dateFin.getTime()) || dateFin <= dateDebut) {
      throw new BadRequestException("Dates de l'année suivante invalides");
    }
    if (dateDebut <= annee.dateDebut) throw new BadRequestException("L'année suivante doit commencer après l'année clôturée");
    return { existante: null, aCreer: { libelle, dateDebut, dateFin } };
  }

  // ── Contrôles (lecture seule) ──────────────────────────────────────────────────────────────

  private async controles(client: Client, ecoleId: string, annee: any, suivanteId: string | null) {
    const [impayes, paiements, inscrits, coherence, classesSuivante, tarifsSuivante] = await Promise.all([
      client.facture.findMany({
        where: { ecoleId, anneeScolaireId: annee.id, statut: { in: ['IMPAYEE', 'PARTIELLE'] } },
        select: { montantTotal: true, montantPaye: true },
      }),
      client.paiement.aggregate({ where: { ecoleId, facture: { anneeScolaireId: annee.id } }, _count: true, _sum: { montant: true } }),
      client.inscription.count({ where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS' } }),
      this.coherence(client, ecoleId, annee.id),
      suivanteId ? client.classe.count({ where: { ecoleId, anneeScolaireId: suivanteId } }) : 0,
      suivanteId ? client.tarifEcolage.count({ where: { ecoleId, anneeScolaireId: suivanteId } }) : 0,
    ]);
    const resteImpayes = impayes.reduce((t: number, f: any) => t + Number(f.montantTotal) - Number(f.montantPaye), 0);
    const { facturesIncoherentes, sansNumero, doublons: doublonsRecus } = coherence;
    const alertes: string[] = [];
    if (facturesIncoherentes) alertes.push(`${facturesIncoherentes} facture(s) dont le montant payé ne correspond pas à leurs paiements`);
    if (sansNumero || doublonsRecus) alertes.push(`Numéros de reçu : ${sansNumero} manquant(s), ${doublonsRecus} en double`);
    if (annee.cloturee) alertes.push(`L'année ${annee.libelle} est déjà clôturée : seuls les éléments manquants seront créés`);
    return {
      impayes: { nombre: impayes.length, reste: resteImpayes },
      paiements: { nombre: paiements._count ?? 0, total: Number(paiements._sum?.montant ?? 0) },
      elevesInscrits: inscrits,
      facturesIncoherentes,
      recus: { sansNumero, doublons: doublonsRecus },
      suivante: { classes: classesSuivante, tarifs: tarifsSuivante },
      alertes,
      bloquant: facturesIncoherentes > 0,
    };
  }

  // Contrôles de l'audit : factures dont le montant payé ≠ somme des paiements, reçus sans numéro ou en double.
  async coherence(client: Client, ecoleId: string, anneeId: string) {
    const [incoherentes, recus] = await Promise.all([
      // SQL commun à PostgreSQL et SQLite (version bureau) : CAST plutôt que ::int, SUM(CASE…) plutôt que FILTER
      client.$queryRaw`SELECT CAST(COUNT(*) AS INTEGER) AS n FROM factures f
        WHERE f."ecoleId" = ${ecoleId} AND f."anneeScolaireId" = ${anneeId}
        AND f."montantPaye" <> (SELECT COALESCE(SUM(p.montant), 0) FROM paiements p WHERE p."factureId" = f.id)`,
      client.$queryRaw`SELECT CAST(COALESCE(SUM(CASE WHEN numero IS NULL THEN 1 ELSE 0 END), 0) AS INTEGER) AS "sansNumero",
        CAST(COUNT(numero) - COUNT(DISTINCT numero) AS INTEGER) AS doublons FROM paiements WHERE "ecoleId" = ${ecoleId}`,
    ]);
    return {
      facturesIncoherentes: Number(incoherentes?.[0]?.n ?? 0),
      sansNumero: Number(recus?.[0]?.sansNumero ?? 0),
      doublons: Number(recus?.[0]?.doublons ?? 0),
    };
  }

  // ── Plan : ce qui sera créé ────────────────────────────────────────────────────────────────

  private async planifier(client: Client, ecoleId: string, o: OptionsCloture) {
    const opt = this.defauts(o);
    const annee = await this.anneeACloturer(client, ecoleId, o.anneeId);
    const { existante, aCreer } = await this.anneeSuivante(client, ecoleId, annee, o);
    const suivanteId: string | null = existante?.id ?? null;

    const [niveaux, classesA, classesB, tarifsA, tarifsB, fraisA, fraisB, inscriptions] = await Promise.all([
      client.niveau.findMany({ where: { ecoleId }, orderBy: { ordre: 'asc' } }),
      client.classe.findMany({ where: { ecoleId, anneeScolaireId: annee.id, actif: true }, orderBy: { nom: 'asc' } }),
      suivanteId ? client.classe.findMany({ where: { ecoleId, anneeScolaireId: suivanteId } }) : [],
      client.tarifEcolage.findMany({ where: { ecoleId, anneeScolaireId: annee.id } }),
      suivanteId ? client.tarifEcolage.findMany({ where: { ecoleId, anneeScolaireId: suivanteId } }) : [],
      client.fraisInscriptionNiveau.findMany({ where: { ecoleId, anneeScolaireId: annee.id } }),
      suivanteId ? client.fraisInscriptionNiveau.findMany({ where: { ecoleId, anneeScolaireId: suivanteId } }) : [],
      client.inscription.findMany({
        where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS', eleve: { actif: true } },
        include: { eleve: { select: { id: true, prenom: true, nom: true } }, classe: true },
      }),
    ]);

    // Classes : celles de l'année clôturée qui n'existent pas encore dans la suivante (même niveau, même nom)
    const cleClasse = (c: { niveauId: string; nom: string }) => `${c.niveauId}|${c.nom}`;
    const existantesB = new Set(classesB.map(cleClasse));
    const classesACreer = opt.copierClasses
      ? classesA.filter((c: any) => !existantesB.has(cleClasse(c))).map((c: any) => ({ nom: c.nom, niveauId: c.niveauId, capaciteMax: c.capaciteMax }))
      : [];
    const classesFinales = [...classesB.map((c: any) => ({ id: c.id, nom: c.nom, niveauId: c.niveauId })), ...classesACreer.map((c: any) => ({ id: null, ...c }))];

    // Tarifs : recopiés (identiques ou ajustés) quand ils manquent (même niveau, même libellé)
    const existantsTarifsB = new Set(tarifsB.map((t: any) => `${t.niveauId}|${t.libelle}`));
    const tarifsACreer =
      opt.tarifs === 'AUCUN'
        ? []
        : tarifsA
            .filter((t: any) => !existantsTarifsB.has(`${t.niveauId}|${t.libelle}`))
            .map((t: any) => ({
              niveauId: t.niveauId,
              libelle: t.libelle,
              regime: t.regime,
              montant: ajuster(Number(t.montant), opt.ajustementPct),
              dateEcheance: t.dateEcheance ? (opt.decalerEcheances ? plusUnAn(t.dateEcheance) : t.dateEcheance) : null,
            }));
    const tarifsFinals = [...tarifsB.map((t: any) => ({ ...t, montant: Number(t.montant) })), ...tarifsACreer];

    // Frais d'inscription / réinscription par niveau
    const fraisNiveauxB = new Set(fraisB.map((f: any) => f.niveauId));
    const fraisACreer =
      opt.tarifs === 'AUCUN'
        ? []
        : fraisA
            .filter((f: any) => !fraisNiveauxB.has(f.niveauId))
            .map((f: any) => ({
              niveauId: f.niveauId,
              montant: ajuster(Number(f.montant), opt.ajustementPct),
              montantReinscription:
                opt.fraisReinscription != null
                  ? opt.fraisReinscription
                  : f.montantReinscription != null
                    ? ajuster(Number(f.montantReinscription), opt.ajustementPct)
                    : null,
            }));
    const fraisFinals = [...fraisB, ...fraisACreer];

    // Passage : niveau supérieur, même régime ; dernière classe : sortants
    const niveauSuivant = new Map<string, any>();
    niveaux.forEach((n: any, i: number) => niveauSuivant.set(n.id, niveaux[i + 1] ?? null));
    const dejaInscrits = suivanteId
      ? new Set(
          (
            await client.inscription.findMany({
              where: { ecoleId, anneeScolaireId: suivanteId, eleveId: { in: inscriptions.map((i: any) => i.eleveId) } },
              select: { eleveId: true },
            })
          ).map((i: any) => i.eleveId),
        )
      : new Set<string>();
    const destinationDe = (classe: any) => {
      const sup = niveauSuivant.get(classe.niveauId);
      if (!sup) return { sortant: true, classe: null };
      const candidates = classesFinales.filter((c) => c.niveauId === sup.id).sort((a, b) => a.nom.localeCompare(b.nom));
      // même lettre de groupe si possible (« CP1 A » -> « CE1 A »)
      const lettre = /\s([A-Z])$/.exec(classe.nom)?.[1];
      const meme = lettre ? candidates.find((c) => c.nom.endsWith(` ${lettre}`)) : undefined;
      return { sortant: false, classe: meme ?? candidates[0] ?? null, niveau: sup };
    };

    const reinscriptions: any[] = [];
    const sortants: any[] = [];
    const sansDestination: any[] = [];
    const dejaFaits: any[] = [];
    if (opt.reinscrire) {
      for (const i of inscriptions) {
        const nom = `${i.eleve.prenom} ${i.eleve.nom}`;
        if (dejaInscrits.has(i.eleveId)) {
          dejaFaits.push({ eleveId: i.eleveId, nom });
          continue;
        }
        const dest = destinationDe(i.classe);
        if (dest.sortant) sortants.push({ inscriptionId: i.id, eleveId: i.eleveId, nom, classe: i.classe.nom });
        else if (!dest.classe) sansDestination.push({ eleveId: i.eleveId, nom, classe: i.classe.nom, niveau: dest.niveau?.nom });
        else
          reinscriptions.push({
            inscriptionId: i.id,
            eleveId: i.eleveId,
            nom,
            regime: i.regime,
            classeOrigine: i.classe.nom,
            destination: dest.classe,
          });
      }
    }

    // Total facturé prévu pour les réinscrits (frais de réinscription + écolage du niveau et du régime)
    let totalFacture = 0;
    if (opt.genererFactures) {
      for (const r of reinscriptions) {
        const frais = fraisFinals.find((f: any) => f.niveauId === r.destination.niveauId);
        totalFacture += montantFraisInscription(frais ? { montant: frais.montant, montantReinscription: frais.montantReinscription } : null, true);
        totalFacture += tarifsFinals
          .filter((t: any) => t.niveauId === r.destination.niveauId && (t.regime === null || t.regime === r.regime))
          .reduce((s: number, t: any) => s + Number(t.montant), 0);
      }
    }

    const parClasse = new Map<string, { origine: string; destination: string; eleves: number }>();
    for (const r of reinscriptions) {
      const cle = `${r.classeOrigine}→${r.destination.nom}`;
      const l = parClasse.get(cle) ?? { origine: r.classeOrigine, destination: r.destination.nom, eleves: 0 };
      l.eleves++;
      parClasse.set(cle, l);
    }

    return {
      opt,
      annee,
      suivante: existante,
      suivanteACreer: aCreer,
      classesACreer,
      tarifsACreer,
      fraisACreer,
      reinscriptions,
      sortants,
      sansDestination,
      dejaFaits,
      totalFacture,
      parClasse: [...parClasse.values()],
    };
  }

  private resumePlan(plan: Awaited<ReturnType<ClotureService['planifier']>>) {
    return {
      anneeCloturee: { id: plan.annee.id, libelle: plan.annee.libelle, dejaCloturee: !!plan.annee.cloturee },
      anneeSuivante: plan.suivante
        ? { id: plan.suivante.id, libelle: plan.suivante.libelle, aCreer: false, dateDebut: iso(plan.suivante.dateDebut), dateFin: iso(plan.suivante.dateFin) }
        : { id: null, libelle: plan.suivanteACreer!.libelle, aCreer: true, dateDebut: iso(plan.suivanteACreer!.dateDebut), dateFin: iso(plan.suivanteACreer!.dateFin) },
      options: plan.opt,
      classesACreer: plan.classesACreer.length,
      tarifsACreer: plan.tarifsACreer.length,
      fraisACreer: plan.fraisACreer.length,
      reinscriptions: plan.reinscriptions.length,
      reinscriptionsParClasse: plan.parClasse,
      sortants: plan.sortants.map((s: any) => ({ nom: s.nom, classe: s.classe })),
      sansDestination: plan.sansDestination,
      dejaReinscrits: plan.dejaFaits.length,
      totalFacturePrevu: plan.totalFacture,
    };
  }

  async apercu(ecoleId: string, o: OptionsCloture) {
    const plan = await this.planifier(this.prisma, ecoleId, o);
    const controles = await this.controles(this.prisma, ecoleId, plan.annee, plan.suivante?.id ?? null);
    return { controles, plan: this.resumePlan(plan) };
  }

  // ── Sauvegarde préalable (pg_dump) ─────────────────────────────────────────────────────────

  private trouverPgDump(): string | null {
    if (process.env.PG_DUMP) return process.env.PG_DUMP;
    const racine = 'C:\\Program Files\\PostgreSQL';
    if (process.platform === 'win32' && existsSync(racine)) {
      const versions = readdirSync(racine).sort().reverse();
      for (const v of versions) {
        const chemin = join(racine, v, 'bin', 'pg_dump.exe');
        if (existsSync(chemin)) return chemin;
      }
    }
    return 'pg_dump'; // dans le PATH (Linux, serveur Ubuntu)
  }

  async sauvegarder(libelle: string): Promise<string> {
    const url = (process.env.DATABASE_URL ?? '').replace(/\?.*$/, '');
    if (!url) throw new Error('DATABASE_URL absente');
    const dossier = process.env.DOSSIER_SAUVEGARDES ?? resolve(process.cwd(), 'sauvegardes');
    mkdirSync(dossier, { recursive: true });
    const horodatage = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    // Base SQLite (version bureau) : la sauvegarde est une copie du fichier de la base
    if (url.startsWith('file:')) {
      const source = resolve(url.slice('file:'.length));
      const copie = join(dossier, `avant-cloture-${libelle}-${horodatage}.db`);
      copyFileSync(source, copie);
      return copie;
    }
    const fichier = join(dossier, `avant-cloture-${libelle}-${horodatage}.sql`);
    const pgDump = this.trouverPgDump()!;
    await new Promise<void>((ok, ko) => {
      const p = spawn(pgDump, [`--dbname=${url}`, '--format=plain', '--no-owner', `--file=${fichier}`], { stdio: ['ignore', 'ignore', 'pipe'] });
      let erreur = '';
      p.stderr.on('data', (d) => (erreur += String(d)));
      p.on('error', ko);
      p.on('close', (code) => (code === 0 ? ok() : ko(new Error(erreur.trim() || `pg_dump a échoué (${code})`))));
    });
    if (!existsSync(fichier) || statSync(fichier).size === 0) throw new Error('Sauvegarde vide');
    return fichier;
  }

  // ── Exécution ──────────────────────────────────────────────────────────────────────────────

  async executer(ecoleId: string, o: OptionsCloture & { code?: string; sansSauvegarde?: boolean }, utilisateurId: string) {
    // 403 et non 401 : le client déconnecte l'utilisateur sur un 401.
    if (!codeSuppressionValide(o.code)) throw new ForbiddenException(o.code ? 'Code incorrect' : 'Le code de sécurité est requis pour clôturer une année');

    // Contrôles bloquants avant tout
    const apercu = await this.apercu(ecoleId, o);
    if (apercu.controles.bloquant) {
      throw new BadRequestException(`Clôture impossible : ${apercu.controles.alertes.join(' ; ')}`);
    }

    let sauvegarde: string | null = null;
    try {
      sauvegarde = await this.sauvegarder(apercu.plan.anneeCloturee.libelle);
    } catch (e) {
      if (!o.sansSauvegarde) {
        throw new BadRequestException(
          `Sauvegarde automatique impossible (${e instanceof Error ? e.message : e}). Faites une sauvegarde de la base, puis relancez en cochant « continuer sans sauvegarde automatique ».`,
        );
      }
      this.logger.warn(`Clôture sans sauvegarde automatique : ${e instanceof Error ? e.message : e}`);
    }

    // Tout ou rien : une erreur à n'importe quelle étape annule toute la clôture.
    const rapport = await this.prisma.$transaction(
      async (tx: Client) => {
        const plan = await this.planifier(tx, ecoleId, o);
        const factures = new FacturesService(tx);

        // Année suivante
        const suivante =
          plan.suivante ??
          (await tx.anneeScolaire.create({
            data: { ecoleId, libelle: plan.suivanteACreer!.libelle, dateDebut: plan.suivanteACreer!.dateDebut, dateFin: plan.suivanteACreer!.dateFin },
          }));

        // Classes
        const nouvellesClasses = new Map<string, string>();
        for (const c of plan.classesACreer) {
          const cree = await tx.classe.create({
            data: { ecoleId, nom: c.nom, niveauId: c.niveauId, anneeScolaireId: suivante.id, capaciteMax: c.capaciteMax },
          });
          nouvellesClasses.set(`${c.niveauId}|${c.nom}`, cree.id);
        }

        // Tarifs et frais
        for (const t of plan.tarifsACreer) {
          await tx.tarifEcolage.create({
            data: { ecoleId, niveauId: t.niveauId, anneeScolaireId: suivante.id, libelle: t.libelle, montant: t.montant, regime: t.regime, dateEcheance: t.dateEcheance },
          });
        }
        for (const f of plan.fraisACreer) {
          await tx.fraisInscriptionNiveau.create({
            data: { ecoleId, niveauId: f.niveauId, anneeScolaireId: suivante.id, montant: f.montant, montantReinscription: f.montantReinscription },
          });
        }

        // Passage des élèves (même règle que le suivi de parcours : l'inscription quittée est « terminée »)
        let facturesAvant = 0;
        if (plan.opt.genererFactures) facturesAvant = await tx.facture.count({ where: { ecoleId, anneeScolaireId: suivante.id } });
        for (const r of plan.reinscriptions) {
          const classeId = r.destination.id ?? nouvellesClasses.get(`${r.destination.niveauId}|${r.destination.nom}`);
          await tx.inscription.update({ where: { id: r.inscriptionId }, data: { statut: 'TERMINEE' } });
          await tx.inscription.create({
            data: { ecoleId, eleveId: r.eleveId, classeId, anneeScolaireId: suivante.id, regime: r.regime },
          });
          if (plan.opt.genererFactures) await factures.genererFacturesEnrolement(ecoleId, r.eleveId, classeId, suivante.id);
        }
        for (const s of plan.sortants) {
          await tx.inscription.update({ where: { id: s.inscriptionId }, data: { statut: 'TERMINEE' } });
        }
        const facturesCreees = plan.opt.genererFactures
          ? (await tx.facture.count({ where: { ecoleId, anneeScolaireId: suivante.id } })) - facturesAvant
          : 0;

        // Année courante, puis clôture
        if (plan.opt.rendreCourante) {
          await tx.anneeScolaire.updateMany({ where: { ecoleId }, data: { courante: false } });
          await tx.anneeScolaire.update({ where: { id: suivante.id }, data: { courante: true } });
        }
        const resume = {
          ...this.resumePlan({ ...plan, suivante, suivanteACreer: null }),
          facturesCreees,
          sauvegarde,
          executeLe: new Date().toISOString(),
        };
        await tx.anneeScolaire.update({
          where: { id: plan.annee.id },
          data: plan.annee.cloturee
            ? { clotureResume: { ...(plan.annee.clotureResume ?? {}), relance: resume } }
            : { cloturee: true, clotureLe: new Date(), clotureParId: utilisateurId, clotureResume: resume },
        });
        return resume;
      },
      { timeout: 120_000 },
    );
    return { ...rapport, controles: apercu.controles };
  }

  // ── Historique ─────────────────────────────────────────────────────────────────────────────

  async historique(ecoleId: string) {
    const annees = await this.prisma.anneeScolaire.findMany({
      where: { ecoleId, cloturee: true },
      orderBy: { clotureLe: 'desc' },
    });
    const ids = annees.map((a) => a.clotureParId).filter(Boolean) as string[];
    const utilisateurs = ids.length
      ? await this.prisma.utilisateur.findMany({ where: { id: { in: ids } }, select: { id: true, prenom: true, nom: true } })
      : [];
    const nom = new Map(utilisateurs.map((u) => [u.id, `${u.prenom} ${u.nom}`]));
    return annees.map((a) => ({
      anneeId: a.id,
      libelle: a.libelle,
      clotureLe: a.clotureLe,
      cloturePar: a.clotureParId ? (nom.get(a.clotureParId) ?? 'Utilisateur supprimé') : null,
      resume: a.clotureResume,
    }));
  }
}
