import { createHash } from 'crypto';
import { Prisma } from '../generated/prisma/client';

// Moteur de synchronisation, commun au serveur et aux PC bureau.
//
// Principe : chaque base garde, pour chaque ligne de chaque table, une empreinte de son contenu (SyncEtat). Un
// « balayage » compare les lignes actuelles à ces empreintes : toute ligne nouvelle, modifiée ou disparue reçoit un
// numéro de version croissant. Les changements à échanger sont donc les versions plus récentes qu'un curseur, sans
// rien changer au code qui écrit dans les tables.

// Tables propres à la synchronisation : jamais échangées.
const MODELES_EXCLUS = new Set(['SyncEtat', 'SyncHistorique', 'SyncPoste', 'SyncConfig']);

export type Client = any; // PrismaService ou transaction : accès générique aux tables par leur nom

export interface Changement {
  modele: string;
  id: string;
  operation: 'maj' | 'supprimer';
  donnees?: Record<string, unknown>;
  modifieLe: string; // ISO
}

export function modelesSynchronises(): string[] {
  return Object.values(Prisma.ModelName).filter((m) => !MODELES_EXCLUS.has(m));
}

export const delegue = (prisma: Client, modele: string) => prisma[modele.charAt(0).toLowerCase() + modele.slice(1)];

// Valeur transportable en JSON, identique quel que soit le fournisseur : dates en ISO, décimaux en texte.
export function normaliser(v: unknown): unknown {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Date) return v.toISOString();
  if (Array.isArray(v)) return v.map(normaliser);
  if (typeof v === 'object') {
    const o = v as Record<string, unknown> & { toFixed?: unknown; d?: unknown };
    if (typeof o.toFixed === 'function' && 'd' in o) return String(v); // Prisma.Decimal
    const r: Record<string, unknown> = {};
    for (const k of Object.keys(o).sort()) r[k] = normaliser(o[k]);
    return r;
  }
  return v;
}

export function empreinte(ligne: Record<string, unknown>): string {
  return createHash('sha1').update(JSON.stringify(normaliser(ligne))).digest('hex');
}

async function versionMax(prisma: Client): Promise<number> {
  const r = await prisma.syncEtat.aggregate({ _max: { version: true } });
  return r._max.version ?? 0;
}

// Balayage : enregistre comme changements (origine donnée) les lignes nouvelles, modifiées ou supprimées depuis le
// dernier balayage. Renvoie le nombre de changements trouvés.
export async function balayer(prisma: Client, origine: string): Promise<number> {
  let version = await versionMax(prisma);
  const maintenant = new Date();
  let changements = 0;
  for (const modele of modelesSynchronises()) {
    const lignes: Record<string, unknown>[] = await delegue(prisma, modele).findMany();
    const etats: { id: string; ligneId: string; empreinte: string; supprime: boolean }[] = await prisma.syncEtat.findMany({
      where: { modele },
      select: { id: true, ligneId: true, empreinte: true, supprime: true },
    });
    const parLigne = new Map(etats.map((e) => [e.ligneId, e]));
    const nouveaux: Record<string, unknown>[] = [];
    for (const ligne of lignes) {
      const id = String(ligne.id);
      const e = empreinte(ligne);
      const etat = parLigne.get(id);
      parLigne.delete(id);
      // Heure de la modification : la date de mise à jour de la ligne quand la table en a une (comparaison juste des
      // conflits), sinon l'heure du balayage
      const quand = ligne.updatedAt instanceof Date ? ligne.updatedAt : maintenant;
      if (!etat) {
        nouveaux.push({ modele, ligneId: id, empreinte: e, version: ++version, origine, modifieLe: quand });
      } else if (etat.empreinte !== e || etat.supprime) {
        await prisma.syncEtat.update({
          where: { id: etat.id },
          data: { empreinte: e, version: ++version, supprime: false, origine, modifieLe: quand },
        });
        changements++;
      }
    }
    if (nouveaux.length) {
      for (let i = 0; i < nouveaux.length; i += 500) await prisma.syncEtat.createMany({ data: nouveaux.slice(i, i + 500) });
      changements += nouveaux.length;
    }
    // Lignes disparues : suppressions
    for (const etat of parLigne.values()) {
      if (etat.supprime) continue;
      await prisma.syncEtat.update({
        where: { id: etat.id },
        data: { supprime: true, version: ++version, origine, modifieLe: maintenant },
      });
      changements++;
    }
  }
  return changements;
}

// Lecture d'une ligne au format transportable
export async function lireLigne(prisma: Client, modele: string, id: string) {
  const ligne = await delegue(prisma, modele).findUnique({ where: { id } });
  return ligne ? (normaliser(ligne) as Record<string, unknown>) : null;
}

const estErreurCle = (e: unknown) => ['P2003', 'P2014'].includes((e as { code?: string })?.code ?? '') || /foreign key|FOREIGN KEY/i.test(String((e as Error)?.message));

// Applique des changements reçus (création / mise à jour / suppression), en plusieurs passes : une ligne qui dépend
// d'une autre pas encore créée (ou dont une ligne dépendante n'est pas encore supprimée) est réessayée ensuite.
// Renvoie les changements appliqués et ceux qui ont échoué (avec le motif).
export async function appliquer(prisma: Client, changements: Changement[]) {
  let restants = [...changements];
  const appliques: Changement[] = [];
  const echecs: { changement: Changement; motif: string }[] = [];
  for (let passe = 0; passe < 8 && restants.length; passe++) {
    const suivants: Changement[] = [];
    for (const c of restants) {
      try {
        const d = delegue(prisma, c.modele);
        if (!d) throw new Error(`Table inconnue : ${c.modele}`);
        if (c.operation === 'supprimer') {
          await d.deleteMany({ where: { id: c.id } });
        } else {
          const { id: _id, ...donnees } = c.donnees ?? {};
          await d.upsert({ where: { id: c.id }, create: { id: c.id, ...donnees }, update: donnees });
        }
        appliques.push(c);
      } catch (e) {
        if (estErreurCle(e) && passe < 7) suivants.push(c);
        else echecs.push({ changement: c, motif: (e as Error)?.message?.split('\n').slice(-1)[0] ?? 'erreur' });
      }
    }
    if (suivants.length === restants.length) {
      // plus aucun progrès : les restants échouent
      for (const c of suivants) echecs.push({ changement: c, motif: 'Dépendance manquante (ligne liée absente)' });
      restants = [];
      break;
    }
    restants = suivants;
  }
  return { appliques, echecs };
}

// Après application, l'état de ces lignes reflète leur nouveau contenu (sans les reprendre pour un envoi).
export async function marquerAppliques(prisma: Client, changements: Changement[], origine: string) {
  let version = await versionMax(prisma);
  for (const c of changements) {
    const ligne = c.operation === 'supprimer' ? null : await delegue(prisma, c.modele).findUnique({ where: { id: c.id } });
    const donnees = {
      empreinte: ligne ? empreinte(ligne) : '',
      supprime: !ligne,
      version: ++version,
      origine,
      modifieLe: new Date(c.modifieLe),
    };
    await prisma.syncEtat.upsert({
      where: { modele_ligneId: { modele: c.modele, ligneId: c.id } },
      create: { modele: c.modele, ligneId: c.id, ...donnees },
      update: donnees,
    });
  }
}
