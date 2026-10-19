import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import type { Genre, Regime } from '../generated/prisma/enums';
import { ElevesService } from './eleves.service';
import { enregistrerFiliation } from './filiation.util';

// Import / export de la liste des élèves au format Excel. Le même jeu de colonnes sert à l'export,
// au modèle vierge et à l'import : un fichier exporté peut être corrigé puis réimporté tel quel.

type Champ =
  | 'matricule' | 'nom' | 'prenom' | 'genre' | 'dateNaissance' | 'lieuNaissance' | 'adresse'
  | 'classe' | 'niveau' | 'regime'
  | 'contactLien' | 'contactPrenom' | 'contactNom' | 'contactTelephone' | 'contactEmail' | 'contactProfession'
  | 'perePrenom' | 'pereNom' | 'pereTelephone' | 'pereProfession'
  | 'merePrenom' | 'mereNom' | 'mereTelephone' | 'mereProfession';

// `export` seul : colonne informative, ignorée à l'import. Le niveau sert à créer une classe absente.
const COLONNES: { champ: Champ; titre: string; largeur: number; export?: true }[] = [
  { champ: 'matricule', titre: 'Matricule', largeur: 14 },
  { champ: 'nom', titre: 'Nom', largeur: 18 },
  { champ: 'prenom', titre: 'Prénom', largeur: 22 },
  { champ: 'genre', titre: 'Genre (M/F)', largeur: 11 },
  { champ: 'dateNaissance', titre: 'Date de naissance', largeur: 16 },
  { champ: 'lieuNaissance', titre: 'Lieu de naissance', largeur: 18 },
  { champ: 'adresse', titre: 'Adresse', largeur: 24 },
  { champ: 'classe', titre: 'Classe', largeur: 12 },
  { champ: 'niveau', titre: 'Niveau', largeur: 12 },
  { champ: 'regime', titre: 'Régime', largeur: 14 },
  { champ: 'contactLien', titre: 'Contact - lien', largeur: 14 },
  { champ: 'contactPrenom', titre: 'Contact - prénom', largeur: 18 },
  { champ: 'contactNom', titre: 'Contact - nom', largeur: 16 },
  { champ: 'contactTelephone', titre: 'Contact - téléphone', largeur: 16 },
  { champ: 'contactEmail', titre: 'Contact - email', largeur: 22 },
  { champ: 'contactProfession', titre: 'Contact - profession', largeur: 18 },
  { champ: 'perePrenom', titre: 'Père - prénom', largeur: 16 },
  { champ: 'pereNom', titre: 'Père - nom', largeur: 14 },
  { champ: 'pereTelephone', titre: 'Père - téléphone', largeur: 16 },
  { champ: 'pereProfession', titre: 'Père - profession', largeur: 16 },
  { champ: 'merePrenom', titre: 'Mère - prénom', largeur: 16 },
  { champ: 'mereNom', titre: 'Mère - nom', largeur: 14 },
  { champ: 'mereTelephone', titre: 'Mère - téléphone', largeur: 16 },
  { champ: 'mereProfession', titre: 'Mère - profession', largeur: 16 },
];

const LIBELLES_REGIME: Record<Regime, string> = {
  EXTERNAT: 'Externat',
  SEMI_INTERNAT: 'Semi-internat',
  INTERNAT: 'Internat',
  PENSIONNAT: 'Pensionnat',
};

// Minuscules, sans accents ni ponctuation : « Contact – Téléphone » et « contact telephone » se valent.
export const normaliser = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const ALIAS_COLONNES: Record<string, Champ> = {
  genre: 'genre',
  sexe: 'genre',
  prenoms: 'prenom',
  date: 'dateNaissance',
  'ne le': 'dateNaissance',
  lieu: 'lieuNaissance',
  'ne a': 'lieuNaissance',
};

function champDeColonne(titre: string): Champ | undefined {
  const cle = normaliser(titre);
  const colonne = COLONNES.find((c) => normaliser(c.titre) === cle || normaliser(c.champ) === cle.replace(/ /g, ''));
  return colonne?.champ ?? ALIAS_COLONNES[cle];
}

export function lireGenre(v: string): Genre | null {
  const g = normaliser(v);
  if (['m', 'masculin', 'garcon', 'g', 'h', 'homme'].includes(g)) return 'M';
  if (['f', 'feminin', 'fille', 'femme'].includes(g)) return 'F';
  return null;
}

export function lireRegime(v: string): Regime | null {
  const r = normaliser(v).replace(/ /g, '');
  const trouve = (Object.keys(LIBELLES_REGIME) as Regime[]).find(
    (code) => normaliser(code).replace(/ /g, '') === r || normaliser(LIBELLES_REGIME[code]).replace(/ /g, '') === r,
  );
  return trouve ?? null;
}

// Date de cellule Excel : vraie date, numéro de série Excel, ou texte JJ/MM/AAAA (ou AAAA-MM-JJ).
export function lireDate(v: ExcelJS.CellValue): Date | null | 'invalide' {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v.getTime()) ? 'invalide' : v;
  if (typeof v === 'number') return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 86400000);
  const s = String(v).trim();
  if (!s) return null;
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1])));
    return d.getUTCDate() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 ? d : 'invalide';
  }
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) {
    const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
    return isNaN(d.getTime()) ? 'invalide' : d;
  }
  return 'invalide';
}

// Texte d'une cellule, y compris les cellules enrichies, liens (emails) et formules.
function texte(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim();
    if ('result' in v) return String(v.result ?? '').trim();
    return '';
  }
  return String(v).trim();
}

const cleNom = (nom: string, prenom: string) => `${normaliser(nom)}|${normaliser(prenom)}`;
const jour = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : '');

interface Personne {
  prenom: string;
  nom: string;
  telephone: string;
  profession: string;
}

export interface LigneImport {
  ligne: number;
  action: 'CREER' | 'METTRE_A_JOUR' | 'ERREUR';
  matricule: string;
  nomComplet: string;
  classe: string;
  regime: Regime | null;
  erreurs: string[];
  // Interne : données prêtes à enregistrer (non renvoyées au navigateur).
  donnees?: {
    eleveId: string | null;
    eleve: {
      matricule: string | null;
      nom: string;
      prenom: string;
      genre: Genre | null;
      dateNaissance: Date | null;
      lieuNaissance: string | null;
      adresse: string | null;
    };
    classeId: string | null;
    // Classe absente de l'année en cours : créée à l'import (avec son niveau s'il n'existe pas)
    nouvelleClasse: { nom: string; niveau: string } | null;
    regime: Regime | null;
    contact: (Personne & { lien: string; email: string }) | null;
    pere: Personne | null;
    mere: Personne | null;
  };
}

export interface ApercuImport {
  lignes: Omit<LigneImport, 'donnees'>[];
  aCreer: number;
  aMettreAJour: number;
  enErreur: number;
  colonnesIgnorees: string[];
  niveauxACreer: string[];
  classesACreer: string[];
}

export interface ResultatImport {
  crees: number;
  misAJour: number;
  erreurs: { ligne: number; motif: string }[];
  niveauxCrees: string[];
  classesCrees: string[];
}

@Injectable()
export class ElevesImportExportService {
  constructor(
    private prisma: PrismaService,
    private eleves: ElevesService,
  ) {}

  // ── Export ─────────────────────────────────────────────────────────────────────────────────

  // Élèves actifs avec leur inscription de l'année courante (classe, régime), le contact principal,
  // le père et la mère. Filtres facultatifs comme la liste des élèves.
  async exporter(ecoleId: string, filtres: { classeId?: string; regime?: Regime } = {}) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const eleves = await this.prisma.eleve.findMany({
      where: {
        ecoleId,
        actif: true,
        ...(filtres.classeId || filtres.regime
          ? {
              inscriptions: {
                some: { statut: 'EN_COURS', anneeScolaireId: annee?.id, classeId: filtres.classeId, regime: filtres.regime },
              },
            }
          : {}),
      },
      include: {
        inscriptions: {
          where: { statut: 'EN_COURS', ...(annee ? { anneeScolaireId: annee.id } : {}) },
          include: { classe: { include: { niveau: true } } },
        },
        parentsLiens: { include: { parentTuteur: true } },
      },
      orderBy: [{ nom: 'asc' }, { prenom: 'asc' }],
    });

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Élèves');
    this.entete(ws, COLONNES);
    for (const e of eleves) {
      const inscription = e.inscriptions[0];
      const lien = (l: string) => e.parentsLiens.find((p) => p.lien === l)?.parentTuteur;
      const contactLien = e.parentsLiens.find((p) => p.contactPrincipal);
      const contact = contactLien?.parentTuteur;
      const pere = lien('Père');
      const mere = lien('Mère');
      const valeurs: Record<Champ, string | Date | null> = {
        matricule: e.matricule,
        nom: e.nom,
        prenom: e.prenom,
        genre: e.genre,
        dateNaissance: e.dateNaissance,
        lieuNaissance: e.lieuNaissance,
        adresse: e.adresse,
        classe: inscription?.classe.nom ?? null,
        niveau: inscription?.classe.niveau.nom ?? null,
        regime: inscription ? LIBELLES_REGIME[inscription.regime] : null,
        contactLien: contactLien?.lien ?? null,
        contactPrenom: contact?.prenom ?? null,
        contactNom: contact?.nom ?? null,
        contactTelephone: contact?.telephone ?? null,
        contactEmail: contact?.email ?? null,
        contactProfession: contact?.profession ?? null,
        perePrenom: pere?.prenom ?? null,
        pereNom: pere?.nom ?? null,
        pereTelephone: pere?.telephone ?? null,
        pereProfession: pere?.profession ?? null,
        merePrenom: mere?.prenom ?? null,
        mereNom: mere?.nom ?? null,
        mereTelephone: mere?.telephone ?? null,
        mereProfession: mere?.profession ?? null,
      };
      ws.addRow(COLONNES.map((c) => valeurs[c.champ] ?? ''));
    }
    ws.getColumn(COLONNES.findIndex((c) => c.champ === 'dateNaissance') + 1).numFmt = 'dd/mm/yyyy';
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }

  // Modèle vierge : les colonnes à remplir et une feuille d'aide (règles, exemple, classes de l'année).
  async modele(ecoleId: string) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const classes = annee
      ? await this.prisma.classe.findMany({
          where: { ecoleId, anneeScolaireId: annee.id, actif: true },
          include: { niveau: true },
          orderBy: [{ niveau: { ordre: 'asc' } }, { nom: 'asc' }],
        })
      : [];

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Élèves');
    const colonnes = COLONNES.filter((c) => !c.export);
    this.entete(ws, colonnes);
    ws.getColumn(colonnes.findIndex((c) => c.champ === 'dateNaissance') + 1).numFmt = '@';
    ws.getColumn(colonnes.findIndex((c) => c.champ === 'matricule') + 1).numFmt = '@';

    const aide = wb.addWorksheet('Aide');
    aide.getColumn(1).width = 26;
    aide.getColumn(2).width = 90;
    const lignesAide: [string, string][] = [
      ['Remplir la feuille « Élèves »', 'Une ligne par élève, à partir de la ligne 2 (exemple en bas de cette page).'],
      ['Obligatoire', 'Nom, Prénom et Genre (M ou F).'],
      ['Matricule', "S'il correspond à un élève existant, sa fiche est mise à jour au lieu d'en créer une nouvelle."],
      ['Doublons', "Sans matricule, un élève de même nom, prénom (et date de naissance si elle est connue) est mis à jour."],
      ['Cellule vide', "Lors d'une mise à jour, une cellule vide laisse l'information existante inchangée."],
      ['Date de naissance', 'Au format JJ/MM/AAAA, par exemple 14/03/2016.'],
      ['Classe', `Classe de l'année en cours. L'élève y est inscrit et ses frais d'inscription et d'écolage sont facturés comme pour une admission. Une classe absente est créée.`],
      ['Niveau', "Niveau de la classe (CP1, 6ème Année...) : sert à créer une classe absente ; un niveau absent est créé aussi."],
      ['Régime', 'Externat, Semi-internat, Internat ou Pensionnat. Vide : externat pour une nouvelle inscription.'],
      ['Contact', 'Parent ou tuteur à contacter (SMS, rappels). Lien : Parent, Mère, Père, Oncle, Tuteur...'],
      ['Père / Mère', 'Filiation affichée sur la fiche et la carte scolaire.'],
    ];
    for (const [titre, texteAide] of lignesAide) {
      const r = aide.addRow([titre, texteAide]);
      r.getCell(1).font = { bold: true };
      r.getCell(2).alignment = { wrapText: true, vertical: 'top' };
    }
    // L'exemple reste sur la feuille d'aide : oublié sur la feuille « Élèves », il serait importé.
    const exemple: Partial<Record<Champ, string>> = {
      nom: 'DIALLO',
      prenom: 'Aïssatou',
      genre: 'F',
      dateNaissance: '14/03/2016',
      lieuNaissance: 'Conakry',
      classe: classes[0]?.nom ?? 'CP1 A',
      regime: 'Externat',
      contactLien: 'Mère',
      contactPrenom: 'Mariama',
      contactNom: 'BAH',
      contactTelephone: '620000000',
    };
    aide.addRow([]);
    aide.addRow(['Exemple de ligne']).font = { bold: true };
    for (const c of colonnes) if (exemple[c.champ]) aide.addRow([c.titre, exemple[c.champ]]);
    if (classes.length) {
      aide.addRow([]);
      aide.addRow([`Classes ${annee!.libelle}`]).font = { bold: true };
      for (const c of classes) aide.addRow([c.nom, c.niveau.nom]);
    }
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }

  private entete(ws: ExcelJS.Worksheet, colonnes: typeof COLONNES) {
    const r = ws.addRow(colonnes.map((c) => c.titre));
    r.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    colonnes.forEach((c, i) => (ws.getColumn(i + 1).width = c.largeur));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
  }

  // ── Import ─────────────────────────────────────────────────────────────────────────────────

  // Lit le fichier et dit, ligne par ligne, ce que l'import ferait. Rien n'est enregistré.
  async apercu(ecoleId: string, buffer: Buffer): Promise<ApercuImport> {
    const { lignes, colonnesIgnorees, niveauxACreer, classesACreer } = await this.analyser(ecoleId, buffer);
    return {
      niveauxACreer,
      classesACreer,
      lignes: lignes.map(({ donnees: _d, ...l }) => l),
      aCreer: lignes.filter((l) => l.action === 'CREER').length,
      aMettreAJour: lignes.filter((l) => l.action === 'METTRE_A_JOUR').length,
      enErreur: lignes.filter((l) => l.action === 'ERREUR').length,
      colonnesIgnorees,
    };
  }

  // Enregistre les lignes valides ; les lignes en erreur sont ignorées et rapportées.
  async importer(ecoleId: string, buffer: Buffer): Promise<ResultatImport> {
    const { lignes } = await this.analyser(ecoleId, buffer);
    const resultat: ResultatImport = { crees: 0, misAJour: 0, erreurs: [], niveauxCrees: [], classesCrees: [] };
    // Classes (et niveaux) absentes : créées une fois, avant les élèves
    const classesCreees = new Map<string, string>(); // nom normalisé -> id
    for (const l of lignes) {
      const nc = l.donnees?.nouvelleClasse;
      if (!nc || classesCreees.has(normaliser(nc.nom))) continue;
      const { classeId, niveauCree } = await this.creerClasse(ecoleId, nc);
      classesCreees.set(normaliser(nc.nom), classeId);
      resultat.classesCrees.push(nc.nom);
      if (niveauCree) resultat.niveauxCrees.push(nc.niveau);
    }
    for (const l of lignes) {
      if (l.donnees?.nouvelleClasse) l.donnees.classeId = classesCreees.get(normaliser(l.donnees.nouvelleClasse.nom)) ?? null;
    }
    for (const l of lignes) {
      if (l.action === 'ERREUR' || !l.donnees) {
        resultat.erreurs.push({ ligne: l.ligne, motif: l.erreurs.join(' ; ') });
        continue;
      }
      try {
        await this.enregistrer(ecoleId, l.donnees);
        if (l.action === 'CREER') resultat.crees++;
        else resultat.misAJour++;
      } catch (e) {
        resultat.erreurs.push({ ligne: l.ligne, motif: e instanceof Error ? e.message : 'Erreur inconnue' });
      }
    }
    return resultat;
  }

  // Crée la classe dans l'année en cours, et son niveau s'il n'existe pas (placé après les niveaux existants).
  private async creerClasse(ecoleId: string, nc: { nom: string; niveau: string }) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (!annee) throw new BadRequestException("Aucune année scolaire courante n'est définie");
    const niveaux = await this.prisma.niveau.findMany({ where: { ecoleId } });
    let niveau = niveaux.find((n) => normaliser(n.nom) === normaliser(nc.niveau));
    let niveauCree = false;
    if (!niveau) {
      const ordre = Math.max(0, ...niveaux.map((n) => n.ordre)) + 1;
      niveau = await this.prisma.niveau.create({ data: { ecoleId, nom: nc.niveau, ordre } });
      niveauCree = true;
    }
    const existante = await this.prisma.classe.findFirst({ where: { ecoleId, anneeScolaireId: annee.id, nom: nc.nom } });
    const classe =
      existante ?? (await this.prisma.classe.create({ data: { ecoleId, niveauId: niveau.id, anneeScolaireId: annee.id, nom: nc.nom } }));
    return { classeId: classe.id, niveauCree };
  }

  private async enregistrer(ecoleId: string, d: NonNullable<LigneImport['donnees']>) {
    const eleveId = await this.prisma.$transaction(async (tx) => {
      let id = d.eleveId;
      if (id) {
        // Mise à jour : seules les cellules remplies remplacent l'information existante.
        await tx.eleve.update({
          where: { id },
          data: {
            nom: d.eleve.nom,
            prenom: d.eleve.prenom,
            ...(d.eleve.matricule ? { matricule: d.eleve.matricule } : {}),
            ...(d.eleve.genre ? { genre: d.eleve.genre } : {}),
            ...(d.eleve.dateNaissance ? { dateNaissance: d.eleve.dateNaissance } : {}),
            ...(d.eleve.lieuNaissance ? { lieuNaissance: d.eleve.lieuNaissance } : {}),
            ...(d.eleve.adresse ? { adresse: d.eleve.adresse } : {}),
          },
        });
      } else {
        const cree = await tx.eleve.create({
          data: {
            ecoleId,
            matricule: d.eleve.matricule,
            nom: d.eleve.nom,
            prenom: d.eleve.prenom,
            genre: d.eleve.genre!,
            dateNaissance: d.eleve.dateNaissance,
            lieuNaissance: d.eleve.lieuNaissance,
            adresse: d.eleve.adresse,
          },
        });
        id = cree.id;
      }

      if (d.contact) {
        const donneesContact = {
          prenom: d.contact.prenom,
          nom: d.contact.nom,
          telephone: d.contact.telephone || null,
          email: d.contact.email || null,
          profession: d.contact.profession || null,
        };
        const existant = await tx.eleveParent.findFirst({ where: { eleveId: id, contactPrincipal: true } });
        if (existant) {
          await tx.parentTuteur.update({ where: { id: existant.parentTuteurId }, data: donneesContact });
          await tx.eleveParent.update({ where: { id: existant.id }, data: { lien: d.contact.lien } });
        } else {
          const parent = await tx.parentTuteur.create({ data: { ecoleId, ...donneesContact } });
          await tx.eleveParent.create({
            data: { eleveId: id, parentTuteurId: parent.id, lien: d.contact.lien, contactPrincipal: true },
          });
        }
      }
      if (d.pere) await enregistrerFiliation(tx, ecoleId, id, 'Père', d.pere);
      if (d.mere) await enregistrerFiliation(tx, ecoleId, id, 'Mère', d.mere);
      return id;
    });

    // Inscription comme depuis la fiche : facturation de l'inscription et de l'écolage comprise.
    if (d.classeId) {
      await this.eleves.inscrire(ecoleId, { eleveId, classeId: d.classeId, regime: d.regime ?? undefined });
    }
  }

  private async analyser(ecoleId: string, buffer: Buffer) {
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException("Ce fichier n'est pas un classeur Excel (.xlsx) lisible");
    }
    const ws = wb.worksheets.find((w) => normaliser(w.name) === 'eleves') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('Fichier Excel vide');

    const colonnes = new Map<Champ, number>();
    const colonnesIgnorees: string[] = [];
    ws.getRow(1).eachCell((cell, n) => {
      const titre = texte(cell.value);
      if (!titre) return;
      const champ = champDeColonne(titre);
      if (champ && !colonnes.has(champ) && !COLONNES.find((c) => c.champ === champ)?.export) colonnes.set(champ, n);
      else if (!champ) colonnesIgnorees.push(titre);
    });
    if (!colonnes.has('nom') || !colonnes.has('prenom')) {
      throw new BadRequestException('Colonnes Nom et Prénom introuvables : utilisez le modèle à télécharger.');
    }

    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const classes = annee
      ? await this.prisma.classe.findMany({ where: { ecoleId, anneeScolaireId: annee.id }, include: { niveau: true } })
      : [];
    const nomsNiveaux = new Set((await this.prisma.niveau.findMany({ where: { ecoleId }, select: { nom: true } })).map((n) => normaliser(n.nom)));
    const niveauxACreer = new Map<string, string>();
    const classesACreer = new Map<string, string>();
    const classeParNom = new Map<string, (typeof classes)[number]>();
    for (const c of classes) {
      classeParNom.set(normaliser(c.nom), c);
      classeParNom.set(normaliser(`${c.nom} ${c.niveau.nom}`), c);
    }

    const existants = await this.prisma.eleve.findMany({
      where: { ecoleId },
      select: { id: true, matricule: true, nom: true, prenom: true, dateNaissance: true, actif: true },
    });
    const parMatricule = new Map(existants.filter((e) => e.matricule).map((e) => [normaliser(e.matricule!), e]));
    const parNom = new Map<string, typeof existants>();
    for (const e of existants.filter((x) => x.actif)) {
      const cle = cleNom(e.nom, e.prenom);
      parNom.set(cle, [...(parNom.get(cle) ?? []), e]);
    }

    const val = (row: ExcelJS.Row, champ: Champ) => {
      const n = colonnes.get(champ);
      return n ? texte(row.getCell(n).value) : '';
    };
    const brut = (row: ExcelJS.Row, champ: Champ) => {
      const n = colonnes.get(champ);
      return n ? row.getCell(n).value : null;
    };

    const lignes: LigneImport[] = [];
    const vusMatricule = new Map<string, number>();
    const vusEleve = new Map<string, number>();

    for (let i = 2; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const nom = val(row, 'nom');
      const prenom = val(row, 'prenom');
      const matricule = val(row, 'matricule');
      if (!nom && !prenom && !matricule) continue;

      const erreurs: string[] = [];
      if (!nom) erreurs.push('Nom manquant');
      if (!prenom) erreurs.push('Prénom manquant');

      const genreTexte = val(row, 'genre');
      const genre = genreTexte ? lireGenre(genreTexte) : null;
      if (genreTexte && !genre) erreurs.push(`Genre « ${genreTexte} » non reconnu (M ou F)`);

      const date = lireDate(brut(row, 'dateNaissance'));
      if (date === 'invalide') erreurs.push(`Date de naissance « ${val(row, 'dateNaissance')} » invalide (JJ/MM/AAAA)`);
      const dateNaissance = date === 'invalide' ? null : date;

      const classeTexte = val(row, 'classe');
      const classe = classeTexte ? classeParNom.get(normaliser(classeTexte)) : undefined;
      // Classe absente : elle sera créée, avec son niveau (colonne Niveau, sinon le nom de la classe) s'il manque
      const niveauTexte = val(row, 'niveau') || classeTexte;
      const nouvelleClasse = classeTexte && !classe && annee ? { nom: classeTexte, niveau: niveauTexte } : null;
      if (classeTexte && !classe && !annee) erreurs.push(`Classe « ${classeTexte} » : aucune année scolaire courante n'est définie`);
      if (nouvelleClasse) {
        classesACreer.set(normaliser(nouvelleClasse.nom), nouvelleClasse.nom);
        if (!nomsNiveaux.has(normaliser(niveauTexte))) niveauxACreer.set(normaliser(niveauTexte), niveauTexte);
      }

      const regimeTexte = val(row, 'regime');
      const regime = regimeTexte ? lireRegime(regimeTexte) : null;
      if (regimeTexte && !regime) erreurs.push(`Régime « ${regimeTexte} » non reconnu`);
      if (regime && !classeTexte) erreurs.push('Régime indiqué sans classe');

      // Élève existant : par matricule, sinon par nom + prénom (+ date de naissance si connue des deux côtés).
      let existant: (typeof existants)[number] | undefined;
      if (matricule) existant = parMatricule.get(normaliser(matricule));
      if (!existant && nom && prenom) {
        const memeNom = (parNom.get(cleNom(nom, prenom)) ?? []).filter(
          (e) => !dateNaissance || !e.dateNaissance || jour(e.dateNaissance) === jour(dateNaissance),
        );
        const candidats = matricule ? memeNom.filter((e) => !e.matricule) : memeNom;
        if (candidats.length > 1) erreurs.push('Plusieurs élèves portent ce nom : indiquez le matricule');
        else existant = candidats[0];
      }
      if (existant && !existant.actif) erreurs.push('Ce matricule appartient à un élève radié');
      if (!existant && nom && prenom && !genre && !genreTexte) erreurs.push('Genre manquant (M ou F)');

      const cleFichier = matricule ? `m:${normaliser(matricule)}` : `n:${cleNom(nom, prenom)}|${jour(dateNaissance)}`;
      const cleEleve = existant ? `e:${existant.id}` : cleFichier;
      const doublon = vusMatricule.get(cleFichier) ?? vusEleve.get(cleEleve);
      if (doublon) erreurs.push(`Même élève que la ligne ${doublon}`);
      vusMatricule.set(cleFichier, i);
      vusEleve.set(cleEleve, i);

      const personne = (p: 'pere' | 'mere' | 'contact'): Personne | null => {
        const r = {
          prenom: val(row, `${p}Prenom` as Champ),
          nom: val(row, `${p}Nom` as Champ),
          telephone: val(row, `${p}Telephone` as Champ),
          profession: val(row, `${p}Profession` as Champ),
        };
        return r.prenom || r.nom ? r : null;
      };
      const contactBase = personne('contact');
      const contactEmail = val(row, 'contactEmail');
      const contactLien = val(row, 'contactLien');
      if (!contactBase && (contactEmail || val(row, 'contactTelephone'))) {
        erreurs.push('Contact sans prénom ni nom');
      }

      lignes.push({
        ligne: i,
        action: erreurs.length ? 'ERREUR' : existant ? 'METTRE_A_JOUR' : 'CREER',
        matricule: matricule || existant?.matricule || '',
        nomComplet: `${prenom} ${nom}`.trim(),
        classe: classe ? classe.nom : classeTexte,
        regime,
        erreurs,
        donnees: erreurs.length
          ? undefined
          : {
              eleveId: existant?.id ?? null,
              eleve: {
                matricule: matricule || null,
                nom,
                prenom,
                genre,
                dateNaissance,
                lieuNaissance: val(row, 'lieuNaissance') || null,
                adresse: val(row, 'adresse') || null,
              },
              classeId: classe?.id ?? null,
              nouvelleClasse,
              regime,
              contact: contactBase ? { ...contactBase, email: contactEmail, lien: contactLien || 'Parent' } : null,
              pere: personne('pere'),
              mere: personne('mere'),
            },
      });
    }
    if (!lignes.length) throw new BadRequestException('Aucun élève trouvé dans le fichier');
    return { lignes, colonnesIgnorees, niveauxACreer: [...niveauxACreer.values()], classesACreer: [...classesACreer.values()] };
  }
}
