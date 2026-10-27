import { BadRequestException, Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { appliquer, balayer, delegue, lireLigne, marquerAppliques, modelesSynchronises, type Changement } from './sync-moteur';
import { chiffrer, dechiffrer } from './chiffrement.util';

// Synchronisation version bureau ↔ serveur (plan validé par le fondateur, 17/10/2026) :
//   - le serveur (version web, PostgreSQL) est la base de référence ; chaque PC bureau (SQLite) travaille hors ligne ;
//   - le PC envoie ses changements puis reçoit ceux des autres, par l'API du serveur, avec un compte utilisateur ;
//   - conflit (même ligne changée des deux côtés depuis la dernière synchro) : la dernière modification gagne, l'autre
//     version est gardée dans SyncHistorique ;
//   - chaque poste a sa série de reçus (B1-000001...) ;
//   - premier branchement d'un PC : ses données sont remplacées par celles du serveur.
// Le même code sert aux deux rôles : « bureau » quand la base est un fichier SQLite (DATABASE_URL="file:..."),
// « serveur » sinon.

const ID_CONFIG = 'local';
const PAGE = 1000;
const INTERVALLE_MS = 2 * 60 * 1000;

export const modeBureau = () => (process.env.DATABASE_URL ?? '').startsWith('file:');

@Injectable()
export class SyncService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('Synchronisation');
  private minuterie: NodeJS.Timeout | null = null;
  private enCours: Promise<unknown> | null = null;

  constructor(private prisma: PrismaService) {}

  // Bureau : synchronisation automatique toutes les 2 minutes quand elle est activée (rien à faire sur le serveur)
  onModuleInit() {
    if (!modeBureau() || process.env.NODE_ENV === 'test') return;
    this.minuterie = setInterval(() => {
      void this.cycleAutomatique();
    }, INTERVALLE_MS);
  }

  onModuleDestroy() {
    if (this.minuterie) clearInterval(this.minuterie);
  }

  private async cycleAutomatique() {
    try {
      const config = await this.prisma.syncConfig.findUnique({ where: { id: ID_CONFIG } });
      if (config?.actif && config.initialise && !this.enCours) await this.synchroniser();
    } catch (e) {
      this.log.warn(`Synchronisation automatique : ${(e as Error).message}`);
    }
  }

  // ════════════════════════════ CÔTÉ SERVEUR ════════════════════════════

  private exigerServeur() {
    if (modeBureau()) throw new BadRequestException('Cette opération est réservée au serveur');
  }

  // Enregistre un PC (ou retrouve le sien) : code B1, B2... qui sert aussi de série de reçus.
  async enregistrerPoste(ecoleId: string, nom?: string, codeExistant?: string) {
    this.exigerServeur();
    if (codeExistant) {
      const p = await this.prisma.syncPoste.findUnique({ where: { ecoleId_code: { ecoleId, code: codeExistant } } });
      if (p) return { code: p.code, numero: p.numero, ecoleId };
    }
    const dernier = await this.prisma.syncPoste.aggregate({ where: { ecoleId }, _max: { numero: true } });
    const numero = (dernier._max.numero ?? 0) + 1;
    const p = await this.prisma.syncPoste.create({ data: { ecoleId, code: `B${numero}`, numero, nom: nom?.trim() || null } });
    return { code: p.code, numero: p.numero, ecoleId };
  }

  // Une ligne appartient-elle à cette école ? (le serveur peut, en principe, en porter plusieurs)
  private deLEcole(modele: string, ligne: Record<string, unknown> | null | undefined, ecoleId: string) {
    if (!ligne) return true;
    if (modele === 'Ecole') return ligne.id === ecoleId;
    return !('ecoleId' in ligne) || ligne.ecoleId === ecoleId;
  }

  // Reçoit les changements d'un poste. `curseur` : dernière version du serveur que le poste a reçue ; une ligne
  // changée sur le serveur après ce curseur est en conflit : la plus récente des deux modifications gagne.
  async recevoir(ecoleId: string, poste: string, curseur: number, changements: Changement[]) {
    this.exigerServeur();
    await balayer(this.prisma, 'serveur'); // enregistre d'abord les changements faits sur le web
    const acceptes: Changement[] = [];
    const rejetes: { id: string; modele: string; motif: string }[] = [];
    for (const c of changements) {
      if (!this.deLEcole(c.modele, c.donnees, ecoleId)) {
        rejetes.push({ id: c.id, modele: c.modele, motif: "Ligne d'une autre école" });
        continue;
      }
      const etat = await this.prisma.syncEtat.findUnique({ where: { modele_ligneId: { modele: c.modele, ligneId: c.id } } });
      const conflit = etat && etat.version > curseur && etat.origine !== poste;
      if (conflit && etat.modifieLe.getTime() > new Date(c.modifieLe).getTime()) {
        // la version du serveur est plus récente : celle du poste est gardée dans l'historique
        await this.prisma.syncHistorique.create({
          data: { modele: c.modele, ligneId: c.id, donnees: (c.donnees ?? null) as any, modifieLe: new Date(c.modifieLe), poste, raison: 'conflit : version du poste plus ancienne' },
        });
        rejetes.push({ id: c.id, modele: c.modele, motif: 'Version plus ancienne que celle du serveur' });
        continue;
      }
      if (conflit) {
        const actuelle = await lireLigne(this.prisma, c.modele, c.id);
        await this.prisma.syncHistorique.create({
          data: { modele: c.modele, ligneId: c.id, donnees: (actuelle ?? null) as any, modifieLe: etat.modifieLe, poste: etat.origine, raison: `conflit : remplacée par la version de ${poste}` },
        });
      }
      acceptes.push(c);
    }
    const { appliques, echecs } = await appliquer(this.prisma, acceptes);
    await marquerAppliques(this.prisma, appliques, poste);
    for (const e of echecs) {
      rejetes.push({ id: e.changement.id, modele: e.changement.modele, motif: e.motif });
      await this.prisma.syncHistorique.create({
        data: { modele: e.changement.modele, ligneId: e.changement.id, donnees: (e.changement.donnees ?? null) as any, modifieLe: new Date(e.changement.modifieLe), poste, raison: `non appliqué : ${e.motif}` },
      });
    }
    await this.prisma.syncPoste.updateMany({ where: { ecoleId, code: poste }, data: { derniereSyncLe: new Date() } });
    return { appliques: appliques.length, rejetes };
  }

  // Envoie à un poste les changements du serveur depuis son curseur (sauf les siens), par pages.
  async envoyer(ecoleId: string, poste: string, curseur: number) {
    this.exigerServeur();
    await balayer(this.prisma, 'serveur');
    const etats = await this.prisma.syncEtat.findMany({
      where: { version: { gt: curseur }, NOT: { origine: poste } },
      orderBy: { version: 'asc' },
      take: PAGE,
    });
    const changements: Changement[] = [];
    for (const e of etats) {
      if (e.supprime) {
        changements.push({ modele: e.modele, id: e.ligneId, operation: 'supprimer', modifieLe: e.modifieLe.toISOString() });
        continue;
      }
      const donnees = await lireLigne(this.prisma, e.modele, e.ligneId);
      if (!donnees || !this.deLEcole(e.modele, donnees, ecoleId)) continue;
      changements.push({ modele: e.modele, id: e.ligneId, operation: 'maj', donnees, modifieLe: e.modifieLe.toISOString() });
    }
    const nouveauCurseur = etats.length ? etats[etats.length - 1].version : curseur;
    return { changements, curseur: nouveauCurseur, encore: etats.length === PAGE };
  }

  // ════════════════════════════ CÔTÉ BUREAU ════════════════════════════

  private exigerBureau() {
    if (!modeBureau()) throw new BadRequestException('La synchronisation se règle dans la version bureau');
  }

  private async config() {
    return (
      (await this.prisma.syncConfig.findUnique({ where: { id: ID_CONFIG } })) ??
      (await this.prisma.syncConfig.create({ data: { id: ID_CONFIG } }))
    );
  }

  // Réglages affichés dans Configuration : jamais le mot de passe, seulement s'il est enregistré.
  async lireConfig() {
    if (!modeBureau()) return { modeBureau: false };
    const c = await this.config();
    const enAttente = await this.prisma.syncEtat.count({ where: { origine: 'local', version: { gt: c.versionEnvoyee } } });
    return {
      modeBureau: true,
      urlServeur: c.urlServeur ?? '',
      email: c.email ?? '',
      motDePasseEnregistre: !!c.motDePasseChiffre,
      poste: c.poste,
      actif: c.actif,
      initialise: c.initialise,
      derniereSyncLe: c.derniereSyncLe,
      dernierEtat: c.dernierEtat,
      enAttente: c.initialise ? enAttente : null,
      bdHote: c.bdHote ?? '',
      bdPort: c.bdPort ?? null,
      bdNom: c.bdNom ?? '',
      bdUtilisateur: c.bdUtilisateur ?? '',
      bdMotDePasseEnregistre: !!c.bdMotDePasseChiffre,
    };
  }

  async enregistrerConfig(dto: {
    urlServeur?: string;
    email?: string;
    motDePasse?: string;
    actif?: boolean;
    bdHote?: string;
    bdPort?: number | null;
    bdNom?: string;
    bdUtilisateur?: string;
    bdMotDePasse?: string;
  }) {
    this.exigerBureau();
    const c = await this.config();
    const url = dto.urlServeur === undefined ? undefined : dto.urlServeur.trim().replace(/\/+$/, '') || null;
    if (url && !/^https?:\/\/[^\s/]+/i.test(url)) throw new BadRequestException('Adresse du serveur invalide (exemple : https://ecole.mameta.gn)');
    // Changer de serveur : ce PC repartira des données du nouveau serveur
    const changeServeur = url !== undefined && url !== c.urlServeur;
    await this.prisma.syncConfig.update({
      where: { id: ID_CONFIG },
      data: {
        urlServeur: url,
        email: dto.email === undefined ? undefined : dto.email.trim() || null,
        motDePasseChiffre: dto.motDePasse ? chiffrer(dto.motDePasse) : undefined,
        actif: dto.actif,
        bdHote: dto.bdHote === undefined ? undefined : dto.bdHote.trim() || null,
        bdPort: dto.bdPort === undefined ? undefined : dto.bdPort || null,
        bdNom: dto.bdNom === undefined ? undefined : dto.bdNom.trim() || null,
        bdUtilisateur: dto.bdUtilisateur === undefined ? undefined : dto.bdUtilisateur.trim() || null,
        bdMotDePasseChiffre: dto.bdMotDePasse ? chiffrer(dto.bdMotDePasse) : undefined,
        ...(changeServeur ? { initialise: false, poste: null, posteNumero: null, curseurServeur: 0, versionEnvoyee: 0 } : {}),
      },
    });
    return this.lireConfig();
  }

  // Appel à l'API du serveur, avec le compte de synchronisation
  private async api(chemin: string, options: { methode?: string; corps?: unknown; jeton?: string } = {}) {
    const c = await this.config();
    if (!c.urlServeur) throw new BadRequestException("Adresse du serveur non renseignée");
    let reponse: Response;
    try {
      reponse = await fetch(`${c.urlServeur}${chemin}`, {
        method: options.methode ?? 'GET',
        headers: { 'Content-Type': 'application/json', ...(options.jeton ? { Authorization: `Bearer ${options.jeton}` } : {}) },
        body: options.corps === undefined ? undefined : JSON.stringify(options.corps),
        signal: AbortSignal.timeout(60_000),
      });
    } catch (e) {
      throw new BadRequestException(`Serveur injoignable (${(e as Error).message}) : vérifiez l'adresse et la connexion internet`);
    }
    const texte = await reponse.text();
    const json = texte ? JSON.parse(texte) : null;
    if (!reponse.ok) {
      const message = Array.isArray(json?.message) ? json.message.join(', ') : json?.message;
      throw new BadRequestException(`Serveur : ${message ?? reponse.statusText} (${reponse.status})`);
    }
    return json;
  }

  private async connexion() {
    const c = await this.config();
    if (!c.email || !c.motDePasseChiffre) throw new BadRequestException('Compte de synchronisation non renseigné');
    const r = await this.api('/auth/login', { methode: 'POST', corps: { email: c.email, password: dechiffrer(c.motDePasseChiffre) } });
    if (!r?.accessToken) throw new BadRequestException('Connexion au serveur refusée');
    return r.accessToken as string;
  }

  // « Tester la connexion » : adresse joignable, compte accepté, synchronisation disponible sur le serveur
  async tester() {
    this.exigerBureau();
    const jeton = await this.connexion();
    const info = await this.api('/sync/serveur', { jeton });
    return { ok: true, message: `Connexion réussie au serveur (${info?.ecole ?? 'école'}).` };
  }

  // « Tester la base » : connexion directe à la base PostgreSQL du serveur avec les identifiants saisis (lecture
  // seule : version du serveur et nombre d'élèves). La synchronisation, elle, passe toujours par l'API.
  async testerBase() {
    this.exigerBureau();
    const c = await this.config();
    if (!c.bdHote || !c.bdNom || !c.bdUtilisateur || !c.bdMotDePasseChiffre) {
      throw new BadRequestException('Renseignez hôte, base, utilisateur et mot de passe de la base');
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Client } = require('pg') as typeof import('pg');
    const client = new Client({
      host: c.bdHote,
      port: c.bdPort ?? 5432,
      database: c.bdNom,
      user: c.bdUtilisateur,
      password: dechiffrer(c.bdMotDePasseChiffre),
      connectionTimeoutMillis: 15_000,
      ssl: ['localhost', '127.0.0.1'].includes(c.bdHote) ? undefined : { rejectUnauthorized: false },
    });
    try {
      await client.connect();
      const version = (await client.query('SHOW server_version')).rows[0]?.server_version;
      const eleves = await client.query('SELECT count(*)::int AS n FROM eleves').then((r) => r.rows[0]?.n).catch(() => null);
      return {
        ok: true,
        message: `Connexion à la base réussie (PostgreSQL ${version}${eleves === null ? '' : `, ${eleves} élève(s)`}).`,
      };
    } catch (e) {
      throw new BadRequestException(`Connexion à la base impossible : ${(e as Error).message}`);
    } finally {
      await client.end().catch(() => undefined);
    }
  }

  // Synchronisation manuelle ou automatique ; la première fois, ce PC repart des données du serveur.
  async synchroniser() {
    this.exigerBureau();
    if (this.enCours) return this.enCours;
    this.enCours = this.executer().finally(() => (this.enCours = null));
    return this.enCours;
  }

  private async executer() {
    const c = await this.config();
    try {
      const jeton = await this.connexion();
      // Poste : enregistré auprès du serveur (série de reçus Bn)
      if (!c.poste) {
        const p = await this.api('/sync/postes', { methode: 'POST', corps: {}, jeton });
        await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { poste: p.code, posteNumero: p.numero } });
      }
      const resume = c.initialise ? await this.echanger(jeton) : await this.initialiser(jeton);
      const etat = c.initialise
        ? `OK : ${resume.envoyes} envoyé(s), ${resume.recus} reçu(s)${resume.rejetes ? `, ${resume.rejetes} refusé(s)` : ''}`
        : `OK : première synchronisation, ${resume.recus} ligne(s) reçue(s) du serveur`;
      await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { derniereSyncLe: new Date(), dernierEtat: etat, initialise: true } });
      return { ...resume, etat };
    } catch (e) {
      const message = (e as Error).message;
      await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { dernierEtat: `Échec : ${message}` } });
      throw e;
    }
  }

  // Premier branchement : les données de ce PC sont remplacées par celles du serveur.
  private async initialiser(jeton: string) {
    // Vidage dans un ordre qui respecte les liens : plusieurs passes
    let restants = modelesSynchronises();
    for (let passe = 0; passe < 10 && restants.length; passe++) {
      const suivants: string[] = [];
      for (const m of restants) {
        try {
          await delegue(this.prisma, m).deleteMany({});
        } catch {
          suivants.push(m);
        }
      }
      restants = suivants;
    }
    if (restants.length) throw new BadRequestException(`Impossible de vider : ${restants.join(', ')}`);
    await this.prisma.syncEtat.deleteMany({});
    await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { curseurServeur: 0, versionEnvoyee: 0 } });
    const recus = await this.recevoirDuServeur(jeton);
    // Rien à renvoyer : tout vient du serveur
    const max = await this.prisma.syncEtat.aggregate({ _max: { version: true } });
    await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { versionEnvoyee: max._max.version ?? 0 } });
    return { envoyes: 0, recus, rejetes: 0 };
  }

  private async echanger(jeton: string) {
    const c = await this.config();
    // 1. Changements de ce PC depuis le dernier envoi
    await balayer(this.prisma, 'local');
    const etats = await this.prisma.syncEtat.findMany({
      where: { origine: 'local', version: { gt: c.versionEnvoyee } },
      orderBy: { version: 'asc' },
    });
    let envoyes = 0;
    let rejetes = 0;
    for (let i = 0; i < etats.length; i += PAGE) {
      const lot = etats.slice(i, i + PAGE);
      const changements: Changement[] = [];
      for (const e of lot) {
        if (e.supprime) changements.push({ modele: e.modele, id: e.ligneId, operation: 'supprimer', modifieLe: e.modifieLe.toISOString() });
        else {
          const donnees = await lireLigne(this.prisma, e.modele, e.ligneId);
          if (donnees) changements.push({ modele: e.modele, id: e.ligneId, operation: 'maj', donnees, modifieLe: e.modifieLe.toISOString() });
        }
      }
      const r = await this.api('/sync/recevoir', {
        methode: 'POST',
        corps: { poste: (await this.config()).poste, curseur: (await this.config()).curseurServeur, changements },
        jeton,
      });
      envoyes += r.appliques;
      rejetes += r.rejetes?.length ?? 0;
      await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { versionEnvoyee: lot[lot.length - 1].version } });
    }
    // 2. Changements des autres (dont les versions du serveur qui ont gagné un conflit)
    const recus = await this.recevoirDuServeur(jeton);
    return { envoyes, recus, rejetes };
  }

  private async recevoirDuServeur(jeton: string) {
    let recus = 0;
    for (let page = 0; page < 1000; page++) {
      const c = await this.config();
      const r = await this.api(`/sync/envoyer?poste=${encodeURIComponent(c.poste ?? '')}&curseur=${c.curseurServeur}`, { jeton });
      const { appliques, echecs } = await appliquer(this.prisma, r.changements as Changement[]);
      await marquerAppliques(this.prisma, appliques, 'serveur');
      if (echecs.length) this.log.warn(`${echecs.length} changement(s) du serveur non appliqué(s) : ${echecs[0].motif}`);
      recus += appliques.length;
      await this.prisma.syncConfig.update({ where: { id: ID_CONFIG }, data: { curseurServeur: r.curseur } });
      if (!r.encore) break;
    }
    return recus;
  }
}
