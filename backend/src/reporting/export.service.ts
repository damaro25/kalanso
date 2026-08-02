import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { BulletinService, calculerMoyenne, mention } from '../notes/bulletin.service';
import { genererBulletinPdf } from '../notes/bulletin-pdf.util';
import { genererEmploiDuTempsPdf, type CreneauPdfData } from '../emploi-du-temps/emploi-du-temps-pdf.util';
import { PaieService } from '../paie/paie.service';
import { genererBulletinPaiePdf } from '../paie/bulletin-paie-pdf.util';
import { LogistiqueService } from '../logistique/logistique.service';
import { ParcoursService } from '../parcours/parcours.service';

const LABELS_DECISION: Record<string, string> = {
  ADMIS: 'Passage classe sup.',
  REDOUBLE: 'Redouble',
};

const LABELS_ETAT_MATERIEL: Record<string, string> = {
  BON: 'Bon',
  MOYEN: 'Moyen',
  A_REPARER: 'À réparer',
  HORS_SERVICE: 'Hors service',
};

const LABELS_CATEGORIE_MATERIEL: Record<string, string> = {
  MOBILIER: 'Mobilier',
  INFORMATIQUE: 'Informatique',
  PEDAGOGIQUE: 'Pédagogique',
  AUTRE: 'Autre',
};

const ORDRE_JOURS = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];

const LABELS_JOURS: Record<string, string> = {
  LUNDI: 'Lundi',
  MARDI: 'Mardi',
  MERCREDI: 'Mercredi',
  JEUDI: 'Jeudi',
  VENDREDI: 'Vendredi',
  SAMEDI: 'Samedi',
};

const LABELS_STATUT_ABSENCE: Record<string, string> = {
  PRESENT: 'Présent',
  ABSENT: 'Absent',
  RETARD: 'Retard',
};

const MOIS_LABELS = [
  '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

@Injectable()
export class ExportService {
  constructor(
    private prisma: PrismaService,
    private bulletinService: BulletinService,
    private paieService: PaieService,
    private logistiqueService: LogistiqueService,
    private parcoursService: ParcoursService,
  ) {}

  private async resoudreAnnee(ecoleId: string) {
    const courante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (courante) return courante;
    // à défaut, la plus récente
    const derniere = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
    if (!derniere) throw new BadRequestException('Aucune année scolaire définie');
    return derniere;
  }

  async elevesXlsx(ecoleId: string, classeId?: string): Promise<Buffer> {
    const anneeCourante = await this.resoudreAnnee(ecoleId);
    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: anneeCourante.id, statut: 'EN_COURS', ...(classeId ? { classeId } : {}) },
      include: { eleve: true, classe: true },
      orderBy: { eleve: { nom: 'asc' } },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Élèves');
    sheet.columns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénom', key: 'prenom', width: 20 },
      { header: 'Genre', key: 'genre', width: 10 },
      { header: 'Classe', key: 'classe', width: 15 },
    ];
    for (const i of inscriptions) {
      sheet.addRow({
        matricule: i.eleve.matricule ?? '',
        nom: i.eleve.nom,
        prenom: i.eleve.prenom,
        genre: i.eleve.genre,
        classe: i.classe.nom,
      });
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async impayesXlsx(ecoleId: string): Promise<Buffer> {
    const anneeCourante = await this.resoudreAnnee(ecoleId);
    const factures = await this.prisma.facture.findMany({
      where: { ecoleId, anneeScolaireId: anneeCourante.id, statut: { in: ['IMPAYEE', 'PARTIELLE'] } },
      include: { eleve: true },
      orderBy: { dateEcheance: 'asc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Impayés');
    sheet.columns = [
      { header: 'Élève', key: 'eleve', width: 25 },
      { header: 'Libellé', key: 'libelle', width: 25 },
      { header: 'Montant total', key: 'montantTotal', width: 15 },
      { header: 'Montant payé', key: 'montantPaye', width: 15 },
      { header: 'Reste à payer', key: 'reste', width: 15 },
      { header: 'Statut', key: 'statut', width: 12 },
    ];
    for (const f of factures) {
      sheet.addRow({
        eleve: `${f.eleve.prenom} ${f.eleve.nom}`,
        libelle: f.libelle,
        montantTotal: Number(f.montantTotal),
        montantPaye: Number(f.montantPaye),
        reste: Number(f.montantTotal) - Number(f.montantPaye),
        statut: f.statut,
      });
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async facturesXlsx(ecoleId: string): Promise<Buffer> {
    const factures = await this.prisma.facture.findMany({
      where: { ecoleId },
      include: { eleve: true },
      orderBy: { createdAt: 'desc' },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Factures');
    sheet.columns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Élève', key: 'eleve', width: 25 },
      { header: 'Libellé', key: 'libelle', width: 25 },
      { header: 'Type', key: 'type', width: 14 },
      { header: 'Montant total', key: 'montantTotal', width: 15 },
      { header: 'Montant payé', key: 'montantPaye', width: 15 },
      { header: 'Reste à payer', key: 'reste', width: 15 },
      { header: 'Statut', key: 'statut', width: 12 },
      { header: "Date d'échéance", key: 'dateEcheance', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };

    for (const f of factures) {
      sheet.addRow({
        matricule: f.eleve.matricule ?? '',
        eleve: `${f.eleve.prenom} ${f.eleve.nom}`,
        libelle: f.libelle,
        type: f.type,
        montantTotal: Number(f.montantTotal),
        montantPaye: Number(f.montantPaye),
        reste: Number(f.montantTotal) - Number(f.montantPaye),
        statut: f.statut,
        dateEcheance: f.dateEcheance ? f.dateEcheance.toLocaleDateString('fr-FR') : '',
      });
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async factureModeleXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Modèle');
    sheet.columns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénom', key: 'prenom', width: 20 },
      { header: 'Libellé', key: 'libelle', width: 25 },
      { header: 'Montant', key: 'montant', width: 15 },
      { header: 'Date échéance', key: 'dateEcheance', width: 16 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      matricule: '0012ELV',
      nom: 'Diallo',
      prenom: 'Fatoumata',
      libelle: 'Frais de cantine — Juillet',
      montant: 150000,
      dateEcheance: '',
    });
    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async paieModeleXlsx(): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Modèle');
    sheet.columns = [
      { header: 'Matricule', key: 'matricule', width: 15 },
      { header: 'Nom', key: 'nom', width: 20 },
      { header: 'Prénom', key: 'prenom', width: 20 },
      { header: 'Mois', key: 'mois', width: 8 },
      { header: 'Année', key: 'annee', width: 10 },
      { header: 'Libellé', key: 'libelle', width: 22 },
      { header: 'Montant gain', key: 'gain', width: 14 },
      { header: 'Montant retenue', key: 'retenue', width: 16 },
      { header: 'Imposable', key: 'imposable', width: 12 },
      { header: 'Mode de paiement', key: 'mode', width: 18 },
    ];
    sheet.getRow(1).font = { bold: true };
    sheet.addRow({
      matricule: '0021BCF',
      nom: 'Touré',
      prenom: 'Makalé',
      mois: 8,
      annee: 2026,
      libelle: 'Prime exceptionnelle',
      gain: 100000,
      retenue: 0,
      imposable: 'Oui',
      mode: 'Billetage',
    });
    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async bulletinXlsx(ecoleId: string, eleveId: string, trimestre: number): Promise<Buffer> {
    const bulletin = await this.bulletinService.calculer(ecoleId, eleveId, trimestre);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Bulletin');

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = `Bulletin de notes — Trimestre ${bulletin.trimestre}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.getCell('A3').value = 'Élève :';
    sheet.getCell('B3').value = `${bulletin.eleve.prenom} ${bulletin.eleve.nom}`;
    sheet.getCell('A4').value = 'Classe :';
    sheet.getCell('B4').value = bulletin.classe.nom;
    sheet.getCell('A5').value = 'Année scolaire :';
    sheet.getCell('B5').value = bulletin.anneeScolaire.libelle;

    sheet.getRow(7).values = ['Matière', 'Coefficient', 'Note / 10', 'Appréciation'];
    sheet.getRow(7).font = { bold: true };
    sheet.columns = [{ width: 25 }, { width: 12 }, { width: 12 }, { width: 30 }];

    let row = 8;
    for (const note of bulletin.notes) {
      sheet.getRow(row).values = [note.matiere, note.coefficient, note.valeur, note.appreciation ?? ''];
      row += 1;
    }

    row += 1;
    sheet.getCell(`A${row}`).value = 'Moyenne générale :';
    sheet.getCell(`A${row}`).font = { bold: true };
    sheet.getCell(`B${row}`).value = Number(bulletin.moyenneGenerale.toFixed(2));

    row += 1;
    sheet.getCell(`A${row}`).value = 'Mention :';
    sheet.getCell(`B${row}`).value = bulletin.mention;

    row += 1;
    sheet.getCell(`A${row}`).value = 'Rang :';
    sheet.getCell(`B${row}`).value = `${bulletin.rang} / ${bulletin.effectifClasse}`;

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async appelXlsx(ecoleId: string, classeId: string, date: string): Promise<Buffer> {
    const classe = await this.prisma.classe.findFirstOrThrow({
      where: { id: classeId, ecoleId },
      include: { niveau: true },
    });

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, classeId, statut: 'EN_COURS' },
      include: { eleve: true },
      orderBy: { eleve: { nom: 'asc' } },
    });

    const absences = await this.prisma.absence.findMany({
      where: { ecoleId, classeId, date: new Date(date) },
    });
    const statutParEleve = new Map(absences.map((a) => [a.eleveId, a]));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Appel');

    sheet.mergeCells('A1:D1');
    sheet.getCell('A1').value = `Appel du ${new Date(date).toLocaleDateString('fr-FR')} — ${classe.nom} (${classe.niveau.nom})`;
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.getRow(3).values = ['Nom', 'Prénom', 'Statut', 'Motif'];
    sheet.getRow(3).font = { bold: true };
    sheet.columns = [{ width: 20 }, { width: 20 }, { width: 15 }, { width: 30 }];

    let row = 4;
    for (const inscription of inscriptions) {
      const absence = statutParEleve.get(inscription.eleveId);
      sheet.getRow(row).values = [
        inscription.eleve.nom,
        inscription.eleve.prenom,
        absence ? (LABELS_STATUT_ABSENCE[absence.statut] ?? absence.statut) : 'Non renseigné',
        absence?.motif ?? '',
      ];
      row += 1;
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async notesClasseXlsx(ecoleId: string, classeId: string, trimestre: number): Promise<Buffer> {
    const classe = await this.prisma.classe.findFirstOrThrow({
      where: { id: classeId, ecoleId },
      include: { niveau: true },
    });

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, classeId, statut: 'EN_COURS' },
      include: { eleve: true },
      orderBy: { eleve: { nom: 'asc' } },
    });

    const matieres = await this.prisma.matiere.findMany({
      where: { ecoleId, niveauId: classe.niveauId },
      orderBy: { nom: 'asc' },
    });

    const notes = await this.prisma.note.findMany({ where: { ecoleId, classeId, trimestre } });
    const noteParEleveEtMatiere = new Map(notes.map((n) => [`${n.eleveId}-${n.matiereId}`, Number(n.valeur)]));

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Notes');

    sheet.mergeCells(1, 1, 1, matieres.length + 3);
    sheet.getCell(1, 1).value = `Notes — Trimestre ${trimestre} — ${classe.nom} (${classe.niveau.nom})`;
    sheet.getCell(1, 1).font = { bold: true, size: 14 };

    const headerRow = 3;
    sheet.getCell(headerRow, 1).value = 'Nom';
    sheet.getCell(headerRow, 2).value = 'Prénom';
    matieres.forEach((m, i) => {
      sheet.getCell(headerRow, 3 + i).value = `${m.nom} (coef. ${Number(m.coefficient)})`;
    });
    sheet.getCell(headerRow, 3 + matieres.length).value = 'Moyenne générale';
    sheet.getCell(headerRow, 4 + matieres.length).value = 'Mention';
    sheet.getRow(headerRow).font = { bold: true };

    sheet.getColumn(1).width = 20;
    sheet.getColumn(2).width = 20;
    matieres.forEach((_, i) => {
      sheet.getColumn(3 + i).width = 16;
    });
    sheet.getColumn(3 + matieres.length).width = 16;
    sheet.getColumn(4 + matieres.length).width = 14;

    let row = headerRow + 1;
    for (const inscription of inscriptions) {
      sheet.getCell(row, 1).value = inscription.eleve.nom;
      sheet.getCell(row, 2).value = inscription.eleve.prenom;

      const notesEleve: { valeur: number; coefficient: number }[] = [];
      matieres.forEach((m, i) => {
        const valeur = noteParEleveEtMatiere.get(`${inscription.eleveId}-${m.id}`);
        sheet.getCell(row, 3 + i).value = valeur ?? '';
        if (valeur !== undefined) {
          notesEleve.push({ valeur, coefficient: Number(m.coefficient) });
        }
      });

      const moyenne = calculerMoyenne(notesEleve);
      sheet.getCell(row, 3 + matieres.length).value = notesEleve.length > 0 ? Number(moyenne.toFixed(2)) : '';
      sheet.getCell(row, 4 + matieres.length).value = notesEleve.length > 0 ? mention(moyenne) : '';
      row += 1;
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  private async chargerEmploiDuTemps(ecoleId: string, classeId: string) {
    const classe = await this.prisma.classe.findFirstOrThrow({
      where: { id: classeId, ecoleId },
      include: { niveau: true, anneeScolaire: true },
    });

    const creneaux = await this.prisma.creneau.findMany({
      where: { ecoleId, classeId },
      include: { matiere: true, personnel: true, salle: true },
      orderBy: { heureDebut: 'asc' },
    });

    const creneauxTries: CreneauPdfData[] = ORDRE_JOURS.flatMap((jour) =>
      creneaux
        .filter((c) => c.jour === jour)
        .map((c) => ({
          jour: LABELS_JOURS[jour],
          heureDebut: c.heureDebut,
          heureFin: c.heureFin,
          matiere: c.matiere.nom,
          enseignant: c.personnel ? `${c.personnel.prenom} ${c.personnel.nom}` : null,
          salle: c.salle?.nom ?? null,
        })),
    );

    return { classe, creneauxTries };
  }

  async emploiDuTempsXlsx(ecoleId: string, classeId: string): Promise<Buffer> {
    const { classe, creneauxTries } = await this.chargerEmploiDuTemps(ecoleId, classeId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Emploi du temps');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = `Emploi du temps — ${classe.nom} (${classe.niveau.nom}) — ${classe.anneeScolaire.libelle}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.getRow(3).values = ['Jour', 'Horaire', 'Matière', 'Enseignant', 'Salle'];
    sheet.getRow(3).font = { bold: true };
    sheet.columns = [{ width: 12 }, { width: 16 }, { width: 22 }, { width: 25 }, { width: 14 }];

    let row = 4;
    for (const creneau of creneauxTries) {
      sheet.getRow(row).values = [
        creneau.jour,
        `${creneau.heureDebut} – ${creneau.heureFin}`,
        creneau.matiere,
        creneau.enseignant ?? '—',
        creneau.salle ?? '—',
      ];
      row += 1;
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async emploiDuTempsPdf(ecoleId: string, classeId: string): Promise<Buffer> {
    const { classe, creneauxTries } = await this.chargerEmploiDuTemps(ecoleId, classeId);
    const ecole = await this.prisma.ecole.findUniqueOrThrow({ where: { id: ecoleId } });

    return genererEmploiDuTempsPdf({
      ecoleNom: ecole.nom,
      classeNom: classe.nom,
      niveauNom: classe.niveau.nom,
      anneeScolaireLibelle: classe.anneeScolaire.libelle,
      creneaux: creneauxTries,
    });
  }

  async bulletinPdf(ecoleId: string, eleveId: string, trimestre: number): Promise<Buffer> {
    const bulletin = await this.bulletinService.calculer(ecoleId, eleveId, trimestre);
    const ecole = await this.prisma.ecole.findUniqueOrThrow({ where: { id: ecoleId } });

    return genererBulletinPdf({
      ecoleNom: ecole.nom,
      eleveNom: bulletin.eleve.nom,
      eleprenom: bulletin.eleve.prenom,
      classeNom: bulletin.classe.nom,
      anneeScolaireLibelle: bulletin.anneeScolaire.libelle,
      trimestre: bulletin.trimestre,
      notes: bulletin.notes,
      moyenneGenerale: bulletin.moyenneGenerale,
      mention: bulletin.mention,
      rang: bulletin.rang,
      effectifClasse: bulletin.effectifClasse,
    });
  }

  async bulletinPaiePdf(ecoleId: string, bulletinId: string): Promise<Buffer> {
    const bulletin = await this.paieService.findOne(ecoleId, bulletinId);
    return genererBulletinPaiePdf({
      ecoleNom: bulletin.ecole.nom,
      personnelNom: bulletin.personnel.nom,
      personnelPrenom: bulletin.personnel.prenom,
      matricule: bulletin.personnel.matricule,
      fonction: bulletin.personnel.fonction,
      mois: bulletin.mois,
      annee: bulletin.annee,
      nombreHeures: bulletin.nombreHeures,
      lignes: bulletin.lignes.map((l) => ({
        libelle: l.libelle,
        imposable: l.imposable,
        montantGain: Number(l.montantGain),
        montantRetenue: Number(l.montantRetenue),
      })),
      totalGains: Number(bulletin.totalGains),
      totalRetenues: Number(bulletin.totalRetenues),
      netAPayer: Number(bulletin.netAPayer),
      modePaiement: bulletin.modePaiement,
      statut: bulletin.statut,
    });
  }

  async inventaireXlsx(ecoleId: string): Promise<Buffer> {
    const materiels = await this.logistiqueService.findAll(ecoleId, {});

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Inventaire');

    sheet.mergeCells('A1:E1');
    sheet.getCell('A1').value = 'Inventaire du matériel';
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.getRow(3).values = ['Catégorie', 'Désignation', 'Quantité', 'État', 'Salle'];
    sheet.getRow(3).font = { bold: true };
    sheet.columns = [{ width: 16 }, { width: 28 }, { width: 12 }, { width: 14 }, { width: 18 }];

    let row = 4;
    let total = 0;
    for (const m of materiels) {
      sheet.getRow(row).values = [
        LABELS_CATEGORIE_MATERIEL[m.categorie] ?? m.categorie,
        m.designation,
        m.quantite,
        LABELS_ETAT_MATERIEL[m.etat] ?? m.etat,
        m.salle?.nom ?? '—',
      ];
      total += m.quantite;
      row += 1;
    }

    row += 1;
    sheet.getCell(`B${row}`).value = 'TOTAL ARTICLES :';
    sheet.getCell(`B${row}`).font = { bold: true };
    sheet.getCell(`C${row}`).value = total;
    sheet.getCell(`C${row}`).font = { bold: true };

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  async cahierPaieXlsx(ecoleId: string, mois: number, annee: number): Promise<Buffer> {
    const bulletins = await this.paieService.findByMois(ecoleId, mois, annee);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Cahier de paie');

    sheet.mergeCells('A1:G1');
    sheet.getCell('A1').value = `Cahier de paie — ${MOIS_LABELS[mois]} ${annee}`;
    sheet.getCell('A1').font = { bold: true, size: 14 };

    sheet.getRow(3).values = ['Matricule', 'Nom', 'Prénom', 'Statut', 'Total gains', 'Total retenues', 'Net à payer'];
    sheet.getRow(3).font = { bold: true };
    sheet.columns = [{ width: 15 }, { width: 20 }, { width: 20 }, { width: 12 }, { width: 16 }, { width: 16 }, { width: 16 }];

    let row = 4;
    let masseSalariale = 0;
    let brouillonExclu = 0;
    for (const b of bulletins) {
      sheet.getRow(row).values = [
        b.personnel.matricule ?? '',
        b.personnel.nom,
        b.personnel.prenom,
        b.statut,
        Number(b.totalGains),
        Number(b.totalRetenues),
        Number(b.netAPayer),
      ];
      if (b.statut === 'BROUILLON') {
        brouillonExclu += Number(b.netAPayer);
      } else {
        masseSalariale += Number(b.netAPayer);
      }
      row += 1;
    }

    row += 1;
    sheet.getCell(`D${row}`).value = 'MASSE SALARIALE validée (net) :';
    sheet.getCell(`D${row}`).font = { bold: true };
    sheet.getCell(`G${row}`).value = masseSalariale;
    sheet.getCell(`G${row}`).font = { bold: true };

    if (brouillonExclu > 0) {
      row += 1;
      sheet.getCell(`D${row}`).value = 'dont brouillon, hors masse salariale :';
      sheet.getCell(`G${row}`).value = brouillonExclu;
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }

  // Résultats T1/T2/T3 + moyenne annuelle (moyenne des trimestres renseignés) et
  // décision de passage, pour une classe — même calcul que Suivi de parcours.
  async parcoursClasseXlsx(ecoleId: string, classeId: string): Promise<Buffer> {
    const { classe, seuilPassage, parcours } = await this.parcoursService.parcoursClasse(ecoleId, classeId);

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Parcours');

    sheet.mergeCells(1, 1, 1, 6);
    sheet.getCell(1, 1).value = `Suivi de parcours — ${classe.nom} (${classe.niveau.nom} · ${classe.anneeScolaire.libelle})`;
    sheet.getCell(1, 1).font = { bold: true, size: 14 };
    sheet.mergeCells(2, 1, 2, 6);
    sheet.getCell(2, 1).value = `Seuil de passage : moyenne annuelle ≥ ${seuilPassage}/10`;
    sheet.getCell(2, 1).font = { italic: true };

    const headerRow = 4;
    sheet.getRow(headerRow).values = ['Nom', 'Prénom', 'T1', 'T2', 'T3', 'Moyenne annuelle', 'Décision'];
    sheet.getRow(headerRow).font = { bold: true };
    [20, 20, 10, 10, 10, 16, 22].forEach((w, i) => (sheet.getColumn(i + 1).width = w));

    let row = headerRow + 1;
    for (const ligne of parcours) {
      sheet.getRow(row).values = [
        ligne.eleve.nom,
        ligne.eleve.prenom,
        ligne.moyenneTrimestre1,
        ligne.moyenneTrimestre2,
        ligne.moyenneTrimestre3,
        ligne.moyenneAnnuelle,
        LABELS_DECISION[ligne.decision] ?? ligne.decision,
      ];
      row += 1;
    }

    return workbook.xlsx.writeBuffer() as unknown as Promise<Buffer>;
  }
}
