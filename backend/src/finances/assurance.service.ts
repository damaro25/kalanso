import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { FacturesService } from './factures.service';
import { exigerAnneeOuverte } from '../common/annee-cloturee.util';
import type { Regime } from '../generated/prisma/enums';

export type StatutAssurance = 'PAYEE' | 'PARTIELLE' | 'NON_PAYEE' | 'NON_FACTUREE';

const LIBELLES_STATUT: Record<StatutAssurance, string> = {
  PAYEE: 'Payée',
  PARTIELLE: 'Partiellement payée',
  NON_PAYEE: 'Non payée',
  NON_FACTUREE: 'Non facturée',
};
const LIBELLES_REGIME: Record<string, string> = {
  EXTERNAT: 'Externat',
  SEMI_INTERNAT: 'Semi-internat',
  INTERNAT: 'Internat',
  PENSIONNAT: 'Pensionnat',
};

// Assurance scolaire : annuelle, par élève, obligatoire. Montant par année (et, au besoin, par cycle) dans
// Établissement > Configuration ; une facture ASSURANCE par élève et par année, créée avec les autres factures
// d'inscription (FacturesService.facturerAssurance) ou en masse depuis Finances > Assurance pour les élèves pas
// encore facturés. Le paiement suit le flux habituel (reçu numéroté, bordereau, budget).
@Injectable()
export class AssuranceService {
  constructor(
    private prisma: PrismaService,
    private factures: FacturesService,
  ) {}

  private async annee(ecoleId: string, anneeScolaireId?: string) {
    const annee = anneeScolaireId
      ? await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } })
      : ((await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } })) ??
        (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } })));
    if (!annee) throw new BadRequestException(anneeScolaireId ? 'Année scolaire invalide' : 'Aucune année scolaire définie');
    return annee;
  }

  // ── Configuration ──────────────────────────────────────────────────────────────────────────

  // Montants de l'année : « tous les cycles » puis chaque cycle des niveaux de l'école.
  async configuration(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.annee(ecoleId, anneeScolaireId);
    const [tarifs, niveaux] = await Promise.all([
      this.prisma.tarifAssurance.findMany({ where: { ecoleId, anneeScolaireId: annee.id } }),
      this.prisma.niveau.findMany({ where: { ecoleId }, orderBy: { ordre: 'asc' }, select: { cycle: true } }),
    ]);
    const cycles = [...new Set(niveaux.map((n) => n.cycle?.trim()).filter((c): c is string => !!c))];
    const montant = (cycle: string) => tarifs.find((t) => t.cycle === cycle)?.montant ?? null;
    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle, cloturee: annee.cloturee },
      tousCycles: montant(''),
      parCycle: cycles.map((cycle) => ({ cycle, montant: montant(cycle) })),
    };
  }

  // Enregistre les montants (null ou 0 : pas de montant pour ce cycle / pour tous).
  async definirConfiguration(
    ecoleId: string,
    dto: { anneeScolaireId: string; tousCycles?: number | null; parCycle?: { cycle: string; montant: number | null }[] },
  ) {
    const annee = await this.annee(ecoleId, dto.anneeScolaireId);
    await exigerAnneeOuverte(this.prisma, annee.id, 'modifier le montant du T-shirt');
    const lignes = [{ cycle: '', montant: dto.tousCycles ?? null }, ...(dto.parCycle ?? []).map((l) => ({ cycle: l.cycle.trim(), montant: l.montant }))];
    for (const { cycle, montant } of lignes) {
      if (montant != null && (!Number.isInteger(montant) || montant < 0)) {
        throw new BadRequestException('Le montant du T-shirt doit être un nombre entier positif');
      }
      const cle = { ecoleId_anneeScolaireId_cycle: { ecoleId, anneeScolaireId: annee.id, cycle } };
      if (!montant) await this.prisma.tarifAssurance.deleteMany({ where: { ecoleId, anneeScolaireId: annee.id, cycle } });
      else await this.prisma.tarifAssurance.upsert({ where: cle, create: { ecoleId, anneeScolaireId: annee.id, cycle, montant }, update: { montant } });
    }
    return this.configuration(ecoleId, annee.id);
  }

  // ── Suivi des élèves ───────────────────────────────────────────────────────────────────────

  async suivi(ecoleId: string, filtres: { anneeScolaireId?: string; classeId?: string; regime?: Regime; statut?: StatutAssurance } = {}) {
    const annee = await this.annee(ecoleId, filtres.anneeScolaireId);
    const [inscriptions, factures, tarifs] = await Promise.all([
      this.prisma.inscription.findMany({
        where: {
          ecoleId,
          anneeScolaireId: annee.id,
          statut: { in: ['EN_COURS', 'TERMINEE'] },
          ...(filtres.classeId ? { classeId: filtres.classeId } : {}),
          ...(filtres.regime ? { regime: filtres.regime } : {}),
        },
        include: {
          eleve: { select: { id: true, nom: true, prenom: true, matricule: true, genre: true } },
          classe: { select: { id: true, nom: true, niveau: { select: { cycle: true, ordre: true } } } },
        },
      }),
      this.prisma.facture.findMany({
        where: { ecoleId, anneeScolaireId: annee.id, type: 'ASSURANCE', statut: { not: 'ANNULEE' } },
        select: { id: true, eleveId: true, montantTotal: true, montantPaye: true },
      }),
      this.prisma.tarifAssurance.findMany({ where: { ecoleId, anneeScolaireId: annee.id } }),
    ]);
    const factureParEleve = new Map(factures.map((f) => [f.eleveId, f]));
    const montantPrevu = (cycle: string | null | undefined) =>
      (tarifs.find((t) => cycle && t.cycle === cycle.trim()) ?? tarifs.find((t) => t.cycle === ''))?.montant ?? 0;

    const tous = inscriptions
      .map((i) => {
        const f = factureParEleve.get(i.eleveId);
        const montant = f ? Number(f.montantTotal) : montantPrevu(i.classe.niveau.cycle);
        const paye = f ? Number(f.montantPaye) : 0;
        const statut: StatutAssurance = !f ? 'NON_FACTUREE' : paye >= montant ? 'PAYEE' : paye > 0 ? 'PARTIELLE' : 'NON_PAYEE';
        return {
          eleveId: i.eleveId,
          matricule: i.eleve.matricule,
          nomComplet: `${i.eleve.prenom} ${i.eleve.nom}`,
          genre: i.eleve.genre,
          classe: i.classe.nom,
          classeOrdre: i.classe.niveau.ordre,
          regime: i.regime,
          factureId: f?.id ?? null,
          montant,
          paye,
          reste: Math.max(montant - paye, 0),
          statut,
        };
      })
      .sort((a, b) => a.classeOrdre - b.classeOrdre || a.classe.localeCompare(b.classe) || a.nomComplet.localeCompare(b.nomComplet, 'fr'));
    const lignes = filtres.statut ? tous.filter((l) => l.statut === filtres.statut) : tous;

    const somme = (cle: 'montant' | 'paye' | 'reste') => lignes.reduce((t, l) => t + l[cle], 0);
    const compter = (s: StatutAssurance) => lignes.filter((l) => l.statut === s).length;
    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle, cloturee: annee.cloturee },
      montantConfigure: tarifs.length > 0,
      totaux: {
        eleves: lignes.length,
        attendu: somme('montant'),
        paye: somme('paye'),
        reste: somme('reste'),
        payees: compter('PAYEE'),
        partielles: compter('PARTIELLE'),
        nonPayees: compter('NON_PAYEE'),
        nonFacturees: compter('NON_FACTUREE'),
      },
      lignes: lignes.map(({ classeOrdre: _o, ...l }) => l),
    };
  }

  // Statut d'assurance d'un élève pour l'année courante (fiche élève).
  async statutEleve(ecoleId: string, eleveId: string) {
    const annee = await this.annee(ecoleId);
    const r = await this.suivi(ecoleId, { anneeScolaireId: annee.id });
    const ligne = r.lignes.find((l) => l.eleveId === eleveId) ?? null;
    return { anneeScolaire: r.anneeScolaire, montantConfigure: r.montantConfigure, ligne };
  }

  // ── Facturation en masse (élèves pas encore facturés) ──────────────────────────────────────

  async facturer(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.annee(ecoleId, anneeScolaireId);
    await exigerAnneeOuverte(this.prisma, annee.id, 'y facturer le T-shirt');
    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS' },
      include: { classe: { select: { niveauId: true } } },
    });
    let creees = 0;
    let total = 0;
    let sansMontant = 0;
    for (const i of inscriptions) {
      const f = await this.factures.facturerAssurance(ecoleId, i.eleveId, annee.id, i.classe.niveauId);
      if (f) {
        creees++;
        total += Number(f.montantTotal);
      } else if ((await this.factures.montantAssurance(ecoleId, annee.id, i.classe.niveauId)) <= 0) {
        sansMontant++;
      }
    }
    return { anneeScolaire: annee.libelle, creees, total, dejaFacturees: inscriptions.length - creees - sansMontant, sansMontant };
  }

  // ── Export Excel ───────────────────────────────────────────────────────────────────────────

  async exportXlsx(ecoleId: string, filtres: Parameters<AssuranceService['suivi']>[1]) {
    const r = await this.suivi(ecoleId, filtres);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('T-shirt');
    ws.addRow([`T-shirt ${r.anneeScolaire.libelle}`]).font = { bold: true, size: 13 };
    ws.addRow([]);
    const entete = ws.addRow(['Matricule', 'Prénoms & Nom', 'Classe', 'Régime', 'Montant', 'Payé', 'Reste', 'Statut']);
    entete.font = { bold: true };
    [14, 28, 14, 14, 12, 12, 12, 20].forEach((l, i) => (ws.getColumn(i + 1).width = l));
    for (const l of r.lignes) {
      ws.addRow([l.matricule ?? '', l.nomComplet, l.classe, LIBELLES_REGIME[l.regime] ?? l.regime, l.montant, l.paye, l.reste, LIBELLES_STATUT[l.statut]]);
    }
    const t = ws.addRow(['', 'Totaux', '', '', r.totaux.attendu, r.totaux.paye, r.totaux.reste, '']);
    t.font = { bold: true };
    ws.eachRow((row, n) => {
      if (n > 3) [5, 6, 7].forEach((c) => (row.getCell(c).numFmt = '#,##0'));
    });
    return {
      buffer: (await wb.xlsx.writeBuffer()) as unknown as Buffer,
      nomFichier: `t-shirt-${r.anneeScolaire.libelle.replace(/[^A-Za-z0-9-]+/g, '-')}.xlsx`,
    };
  }
}
