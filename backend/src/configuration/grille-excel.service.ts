import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigurationService } from './configuration.service';
import { GRILLE_REGIMES, NB_TRANCHES, libelleTranche, type GrilleRegime, type Tranches } from './grille';
import type { GrilleDto } from './dto/configuration.dto';

// Import / export Excel de la grille tarifaire d'une année (écran Configuration). Feuille « Grille » : une ligne
// par niveau (frais d'inscription, de réinscription, puis les trois tranches de chaque régime) ; feuille
// « Échéances » : la date de chaque tranche. Un fichier exporté peut être modifié puis réimporté tel quel.
// L'import passe par ConfigurationService.enregistrerGrille : mêmes contrôles qu'à l'écran, factures inchangées.

const COL_NIVEAU = 'Niveau';
const COL_CYCLE = 'Cycle';
const COL_FRAIS = "Frais d'inscription";
const COL_REINSCRIPTION = 'Frais de réinscription';
const COLONNES_TRANCHES = GRILLE_REGIMES.flatMap((regime) =>
  Array.from({ length: NB_TRANCHES }, (_, i) => ({ regime, numero: i + 1, titre: libelleTranche(regime, i + 1) })),
);

const normaliser = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Espaces ordinaires (toLocaleString met des espaces insécables fines, mal rendues par certains écrans).
const fmt = (n: number | null) => (n === null ? 'vide' : `${n.toLocaleString('fr-FR').replace(/\s/g, ' ')} GNF`);

function texte(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('result' in v) return texte(v.result as ExcelJS.CellValue);
    if ('text' in v) return String(v.text).trim();
    return '';
  }
  return String(v).trim();
}

// Montant d'une cellule : nombre, ou texte « 1 500 000 » / « 1 500 000 GNF » ; vide ou 0 : pas de montant.
export function lireMontant(v: ExcelJS.CellValue): number | null | 'invalide' {
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) return lireMontant(v.result as ExcelJS.CellValue);
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v < 0 || !Number.isFinite(v) ? 'invalide' : v === 0 ? null : v;
  const s = texte(v).replace(/gnf/i, '').replace(/[\s  .]/g, '').replace(',', '.');
  if (!s) return null;
  const n = Number(s);
  if (!Number.isFinite(n) || n < 0) return 'invalide';
  return n === 0 ? null : n;
}

// Date d'échéance : vraie date, numéro de série Excel, JJ/MM/AAAA ou AAAA-MM-JJ ; renvoyée en AAAA-MM-JJ.
export function lireEcheance(v: ExcelJS.CellValue): string | null | 'invalide' {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? 'invalide' : v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000).toISOString().slice(0, 10);
  const s = texte(v);
  if (!s) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? d.toISOString().slice(0, 10) : 'invalide';
  }
  m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m && !isNaN(Date.parse(s))) return s;
  return 'invalide';
}

export interface LigneApercuGrille {
  ligne: number;
  niveau: string;
  action: 'CREE' | 'MODIFIE' | 'INCHANGE' | 'ERREUR';
  changements: string[];
  erreurs: string[];
}

export interface ApercuGrille {
  anneeScolaire: string;
  echeances: { changements: string[]; erreurs: string[] };
  lignes: LigneApercuGrille[];
  niveauxAbsents: string[];
  // Niveaux du fichier qui n'existent pas encore : ils seront créés à l'import
  niveauxACreer: string[];
  aModifier: number;
  enErreur: number;
}

type GrilleActuelle = Awaited<ReturnType<ConfigurationService['grille']>>;

@Injectable()
export class GrilleExcelService {
  constructor(
    private prisma: PrismaService,
    private configuration: ConfigurationService,
  ) {}

  private async libelleAnnee(ecoleId: string, anneeScolaireId: string) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } });
    if (!annee) throw new BadRequestException('Année scolaire invalide');
    return annee.libelle;
  }

  async exporter(ecoleId: string, anneeScolaireId: string) {
    const libelle = await this.libelleAnnee(ecoleId, anneeScolaireId);
    const grille = await this.configuration.grille(ecoleId, anneeScolaireId);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Grille');
    const entete = ws.addRow([COL_NIVEAU, COL_CYCLE, COL_FRAIS, COL_REINSCRIPTION, ...COLONNES_TRANCHES.map((c) => c.titre)]);
    entete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    entete.alignment = { wrapText: true, vertical: 'middle' };
    ws.getColumn(1).width = 18;
    ws.getColumn(2).width = 14;
    for (let c = 3; c <= 4 + COLONNES_TRANCHES.length; c++) {
      ws.getColumn(c).width = 15;
      ws.getColumn(c).numFmt = '#,##0';
    }
    ws.views = [{ state: 'frozen', xSplit: 1, ySplit: 1 }];
    for (const n of grille.niveaux) {
      ws.addRow([
        n.nom,
        n.cycle ?? '',
        n.fraisInscription ?? '',
        n.fraisReinscription ?? '',
        ...COLONNES_TRANCHES.map((c) => n.tarifs[c.regime]?.[c.numero - 1] ?? ''),
      ]);
    }

    const we = wb.addWorksheet('Échéances');
    we.getColumn(1).width = 14;
    we.getColumn(2).width = 16;
    we.addRow(['Tranche', 'Échéance (JJ/MM/AAAA)']).font = { bold: true };
    grille.echeances.forEach((e, i) => {
      const r = we.addRow([`Tranche ${i + 1}`, e ? new Date(e) : '']);
      r.getCell(2).numFmt = 'dd/mm/yyyy';
    });

    const aide = wb.addWorksheet('Aide');
    aide.getColumn(1).width = 100;
    [
      `Grille tarifaire ${libelle}. Modifiez les montants puis réimportez ce fichier depuis Configuration > Grille tarifaire.`,
      "Une cellule vide (ou 0) : pas de frais / pas de tranche. « Écolage - Tranche n » s'applique à tous les régimes.",
      "Frais de réinscription vide : le montant des frais d'inscription s'applique aussi aux réinscriptions.",
      "Les niveaux sont reconnus par leur nom exact ; un niveau absent du fichier n'est pas modifié.",
      "Un niveau qui n'existe pas encore est créé à l'import (avec le cycle indiqué).",
      'Les factures déjà émises ne changent pas.',
    ].forEach((l) => aide.addRow([l]));

    return {
      buffer: (await wb.xlsx.writeBuffer()) as unknown as Buffer,
      nomFichier: `grille-tarifaire-${libelle.replace(/[^A-Za-z0-9-]+/g, '-')}.xlsx`,
    };
  }

  async apercu(ecoleId: string, anneeScolaireId: string, buffer: Buffer): Promise<ApercuGrille> {
    const libelle = await this.libelleAnnee(ecoleId, anneeScolaireId);
    const { apercu } = await this.analyser(ecoleId, anneeScolaireId, buffer);
    return { anneeScolaire: libelle, ...apercu };
  }

  // Enregistre la grille lue dans le fichier, seulement s'il n'y a aucune erreur (une grille à moitié importée
  // laisserait des tarifs incohérents). Les niveaux absents du fichier gardent leurs montants.
  async importer(ecoleId: string, anneeScolaireId: string, buffer: Buffer) {
    await this.libelleAnnee(ecoleId, anneeScolaireId);
    const { apercu, dto, nouveaux } = await this.analyser(ecoleId, anneeScolaireId, buffer);
    if (apercu.enErreur > 0 || apercu.echeances.erreurs.length > 0) {
      throw new BadRequestException('Le fichier contient des erreurs : corrigez-les avant d’importer (voir l’aperçu).');
    }
    // Niveaux inconnus : créés d'abord (à la suite des niveaux existants), puis la grille leur est appliquée.
    if (nouveaux.length) {
      const existants = await this.prisma.niveau.findMany({ where: { ecoleId }, select: { ordre: true } });
      let ordre = Math.max(0, ...existants.map((n) => n.ordre));
      for (const n of nouveaux) {
        const cree = await this.prisma.niveau.create({ data: { ecoleId, nom: n.nom, cycle: n.cycle, ordre: ++ordre } });
        const cible = dto.niveaux.find((x) => x.niveauId === n.niveauId);
        if (cible) cible.niveauId = cree.id;
      }
    }
    const grille = await this.configuration.enregistrerGrille(ecoleId, anneeScolaireId, dto);
    return {
      niveauxModifies: apercu.aModifier,
      niveauxCrees: nouveaux.map((n) => n.nom),
      echeancesModifiees: apercu.echeances.changements.length,
      grille,
    };
  }

  private async analyser(ecoleId: string, anneeScolaireId: string, buffer: Buffer) {
    const actuelle: GrilleActuelle = await this.configuration.grille(ecoleId, anneeScolaireId);
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException("Ce fichier n'est pas un classeur Excel (.xlsx) lisible");
    }
    const ws = wb.worksheets.find((w) => normaliser(w.name) === 'grille') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('Fichier Excel vide');

    const colonnes = new Map<string, number>();
    ws.getRow(1).eachCell((cell, n) => {
      const titre = normaliser(texte(cell.value));
      if (titre && !colonnes.has(titre)) colonnes.set(titre, n);
    });
    const col = (titre: string) => colonnes.get(normaliser(titre));
    if (!col(COL_NIVEAU)) throw new BadRequestException('Colonne « Niveau » introuvable : partez d’un export de la grille.');

    // Grille de départ = grille actuelle ; le fichier remplace les niveaux qu'il contient.
    const niveaux = new Map(
      actuelle.niveaux.map((n) => [
        n.niveauId,
        {
          niveauId: n.niveauId,
          fraisInscription: n.fraisInscription,
          fraisReinscription: n.fraisReinscription,
          tarifs: { ...n.tarifs } as Partial<Record<GrilleRegime, Tranches>>,
        },
      ]),
    );
    const parNom = new Map(actuelle.niveaux.map((n) => [normaliser(n.nom), n]));
    const nouveaux: { niveauId: string; nom: string; cycle: string | null }[] = [];
    const vus = new Map<string, number>();
    const lignes: LigneApercuGrille[] = [];

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const nom = texte(row.getCell(col(COL_NIVEAU)!).value);
      if (!nom) continue;
      const erreurs: string[] = [];
      const changements: string[] = [];
      let niveau = parNom.get(normaliser(nom));
      const nouveau = !niveau;
      if (!niveau) {
        // Niveau inconnu : il sera créé à l'import, avec le cycle indiqué dans le fichier
        const colCycle = col(COL_CYCLE);
        const cycle = (colCycle && texte(row.getCell(colCycle).value)) || null;
        niveau = { niveauId: `nouveau:${i}`, nom, cycle, fraisInscription: null, fraisReinscription: null, tarifs: {} } as unknown as GrilleActuelle['niveaux'][number];
        parNom.set(normaliser(nom), niveau);
        niveaux.set(niveau.niveauId, { niveauId: niveau.niveauId, fraisInscription: null, fraisReinscription: null, tarifs: {} });
        nouveaux.push({ niveauId: niveau.niveauId, nom, cycle });
      }
      if (vus.has(niveau.niveauId)) {
        lignes.push({ ligne: i, niveau: nom, action: 'ERREUR', changements, erreurs: [`Déjà présent ligne ${vus.get(niveau.niveauId)}`] });
        continue;
      }
      vus.set(niveau.niveauId, i);
      const cible = niveaux.get(niveau.niveauId)!;

      const montant = (titre: string, avant: number | null, appliquer: (v: number | null) => void) => {
        const n = col(titre);
        if (!n) return; // colonne absente du fichier : montant inchangé
        const v = lireMontant(row.getCell(n).value);
        if (v === 'invalide') {
          erreurs.push(`${titre} : « ${texte(row.getCell(n).value)} » n'est pas un montant`);
          return;
        }
        if (v !== avant) changements.push(`${titre} : ${fmt(avant)} → ${fmt(v)}`);
        appliquer(v);
      };
      montant(COL_FRAIS, niveau.fraisInscription, (v) => (cible.fraisInscription = v));
      montant(COL_REINSCRIPTION, niveau.fraisReinscription, (v) => (cible.fraisReinscription = v));
      for (const c of COLONNES_TRANCHES) {
        const avant = niveau.tarifs[c.regime]?.[c.numero - 1] ?? null;
        montant(c.titre, avant, (v) => {
          const tranches: Tranches = [...(cible.tarifs[c.regime] ?? [null, null, null])] as Tranches;
          tranches[c.numero - 1] = v;
          cible.tarifs[c.regime] = tranches;
        });
      }
      lignes.push({
        ligne: i,
        niveau: niveau.nom,
        action: erreurs.length ? 'ERREUR' : nouveau ? 'CREE' : changements.length ? 'MODIFIE' : 'INCHANGE',
        changements,
        erreurs,
      });
    }
    if (!lignes.length) throw new BadRequestException('Aucun niveau trouvé dans le fichier');

    // Échéances : feuille « Échéances » (Tranche n | date) ; absente : inchangées.
    const echeances = [...actuelle.echeances];
    const echeancesChangements: string[] = [];
    const echeancesErreurs: string[] = [];
    const we = wb.worksheets.find((w) => normaliser(w.name) === 'echeances');
    if (we) {
      for (let i = 2; i <= we.rowCount; i++) {
        const row = we.getRow(i);
        const m = /(\d)/.exec(texte(row.getCell(1).value));
        const numero = m ? Number(m[1]) : 0;
        if (numero < 1 || numero > NB_TRANCHES) continue;
        const v = lireEcheance(row.getCell(2).value);
        if (v === 'invalide') {
          echeancesErreurs.push(`Tranche ${numero} : « ${texte(row.getCell(2).value)} » n'est pas une date (JJ/MM/AAAA)`);
          continue;
        }
        const avant = echeances[numero - 1];
        if (v !== avant) {
          const jj = (d: string | null) => (d ? d.split('-').reverse().join('/') : 'aucune');
          echeancesChangements.push(`Échéance tranche ${numero} : ${jj(avant)} → ${jj(v)}`);
        }
        echeances[numero - 1] = v;
      }
    }

    const nomsVus = new Set(vus.keys());
    const dto: GrilleDto = { echeances, niveaux: [...niveaux.values()] };
    return {
      dto,
      nouveaux,
      apercu: {
        echeances: { changements: echeancesChangements, erreurs: echeancesErreurs },
        lignes,
        niveauxAbsents: actuelle.niveaux.filter((n) => !nomsVus.has(n.niveauId)).map((n) => n.nom),
        niveauxACreer: nouveaux.map((n) => n.nom),
        aModifier: lignes.filter((l) => l.action === 'MODIFIE').length,
        enErreur: lignes.filter((l) => l.action === 'ERREUR').length,
      },
    };
  }
}
