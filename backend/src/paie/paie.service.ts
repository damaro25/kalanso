import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { PersonnelService } from '../personnel/personnel.service';
import { CreateBulletinPaieDto } from './dto/bulletin-paie.dto';

interface LigneCalcul {
  libelle: string;
  imposable: boolean;
  montantGain: number;
  montantRetenue: number;
}

export interface ImportResultat {
  creees: number;
  erreurs: { ligne: number; motif: string }[];
}

@Injectable()
export class PaieService {
  constructor(
    private prisma: PrismaService,
    private personnelService: PersonnelService,
  ) {}

  async creerBulletin(ecoleId: string, dto: CreateBulletinPaieDto, creeParId: string) {
    const personnel = await this.prisma.personnel.findFirst({ where: { id: dto.personnelId, ecoleId } });
    if (!personnel) {
      throw new NotFoundException('Personnel introuvable');
    }

    const existant = await this.prisma.bulletinPaie.findUnique({
      where: { personnelId_mois_annee: { personnelId: dto.personnelId, mois: dto.mois, annee: dto.annee } },
    });
    if (existant) {
      throw new BadRequestException('Un bulletin existe déjà pour ce personnel sur ce mois');
    }

    // Base salariale : pour un enseignant, une ligne par classe avec les heures
    // saisies pour le mois (Σ heures × taux). Pour l'administratif, salaire fixe.
    let nombreHeures = dto.nombreHeures;
    const lignesBase: LigneCalcul[] = [];

    if (personnel.type === 'ENSEIGNANT') {
      const base = await this.personnelService.lignesBaseEnseignant(
        ecoleId,
        dto.personnelId,
        dto.heuresParClasse,
      );
      nombreHeures = base.totalHeures;
      for (const l of base.lignes) {
        lignesBase.push({ libelle: l.libelle, imposable: true, montantGain: l.montant, montantRetenue: 0 });
      }
    } else if (personnel.salaireBase && Number(personnel.salaireBase) > 0) {
      lignesBase.push({
        libelle: 'Salaire de base',
        imposable: true,
        montantGain: Number(personnel.salaireBase),
        montantRetenue: 0,
      });
    }

    const lignesAdditionnelles: LigneCalcul[] = (dto.lignes ?? []).map((l) => ({
      libelle: l.libelle,
      imposable: l.imposable ?? false,
      montantGain: l.montantGain ?? 0,
      montantRetenue: l.montantRetenue ?? 0,
    }));

    const lignes = [...lignesBase, ...lignesAdditionnelles];
    if (lignes.length === 0) {
      throw new BadRequestException(
        "Aucun montant : définissez un salaire de base (ou les heures/taux pour un enseignant) ou ajoutez des lignes",
      );
    }

    const totalGains = lignes.reduce((acc, l) => acc + l.montantGain, 0);
    const totalRetenues = lignes.reduce((acc, l) => acc + l.montantRetenue, 0);
    const netAPayer = totalGains - totalRetenues;

    if (netAPayer < 0) {
      throw new BadRequestException('Le net à payer ne peut pas être négatif (retenues supérieures aux gains)');
    }

    return this.prisma.bulletinPaie.create({
      data: {
        ecoleId,
        personnelId: dto.personnelId,
        mois: dto.mois,
        annee: dto.annee,
        nombreHeures,
        modePaiement: dto.modePaiement,
        totalGains,
        totalRetenues,
        netAPayer,
        creeParId,
        lignes: {
          create: lignes.map((l, i) => ({
            libelle: l.libelle,
            imposable: l.imposable,
            montantGain: l.montantGain,
            montantRetenue: l.montantRetenue,
            ordre: i,
          })),
        },
      },
      include: { lignes: { orderBy: { ordre: 'asc' } }, personnel: true },
    });
  }

  // Import en masse de bulletins depuis un fichier Excel. Une ligne = une ligne
  // additionnelle de bulletin (indemnité, prime, retenue...) ; les lignes partageant le
  // même personnel/mois/année sont regroupées en un seul bulletin, créé en BROUILLON en
  // passant par creerBulletin() pour bénéficier du même calcul de base salariale et des
  // mêmes garde-fous (bulletin déjà existant, net négatif...).
  async importXlsx(ecoleId: string, buffer: Buffer, creeParId: string): Promise<ImportResultat> {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as any);
    const sheet = workbook.worksheets[0];
    if (!sheet) {
      throw new BadRequestException('Fichier Excel vide');
    }

    const colonnes = new Map<string, number>();
    sheet.getRow(1).eachCell((cell, colNumber) => {
      const cle = String(cell.value ?? '').trim().toLowerCase();
      if (cle) colonnes.set(cle, colNumber);
    });
    const colMatricule = colonnes.get('matricule');
    const colNom = colonnes.get('nom');
    const colPrenom = colonnes.get('prénom') ?? colonnes.get('prenom');
    const colMois = colonnes.get('mois');
    const colAnnee = colonnes.get('année') ?? colonnes.get('annee');
    const colLibelle = colonnes.get('libellé') ?? colonnes.get('libelle');
    const colGain = colonnes.get('montant gain') ?? colonnes.get('gain');
    const colRetenue = colonnes.get('montant retenue') ?? colonnes.get('retenue');
    const colImposable = colonnes.get('imposable');
    const colMode = colonnes.get('mode de paiement') ?? colonnes.get('mode');

    if (!colMois || !colAnnee || (!colMatricule && !(colNom && colPrenom))) {
      throw new BadRequestException(
        'Colonnes attendues : Matricule (ou Nom + Prénom), Mois, Année, Libellé, Montant gain, Montant retenue',
      );
    }

    const personnels = await this.prisma.personnel.findMany({ where: { ecoleId, actif: true } });
    const parMatricule = new Map(
      personnels.filter((p) => p.matricule).map((p) => [p.matricule!.trim().toLowerCase(), p]),
    );
    const parNomPrenom = new Map(
      personnels.map((p) => [`${p.nom.trim().toLowerCase()}|${p.prenom.trim().toLowerCase()}`, p]),
    );

    interface LigneImport {
      libelle: string;
      imposable: boolean;
      montantGain: number;
      montantRetenue: number;
    }
    interface GroupeImport {
      personnelId: string;
      mois: number;
      annee: number;
      modePaiement?: string;
      lignes: LigneImport[];
      premiereLigne: number;
    }
    const groupes = new Map<string, GroupeImport>();
    const erreurs: { ligne: number; motif: string }[] = [];

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (row.actualCellCount === 0) continue;

      const matricule = colMatricule ? String(row.getCell(colMatricule).value ?? '').trim() : '';
      const nom = colNom ? String(row.getCell(colNom).value ?? '').trim() : '';
      const prenom = colPrenom ? String(row.getCell(colPrenom).value ?? '').trim() : '';
      const mois = Number(row.getCell(colMois).value);
      const annee = Number(row.getCell(colAnnee).value);

      if (!matricule && !nom && !prenom && !mois && !annee) continue;

      const personnel =
        (matricule && parMatricule.get(matricule.toLowerCase())) ||
        (nom && prenom && parNomPrenom.get(`${nom.toLowerCase()}|${prenom.toLowerCase()}`));

      if (!personnel) {
        erreurs.push({ ligne: i, motif: `Personnel introuvable (${matricule || `${nom} ${prenom}`})` });
        continue;
      }
      if (!mois || mois < 1 || mois > 12 || !annee) {
        erreurs.push({ ligne: i, motif: 'Mois/Année invalide' });
        continue;
      }

      const cle = `${personnel.id}-${mois}-${annee}`;
      let groupe = groupes.get(cle);
      if (!groupe) {
        groupe = { personnelId: personnel.id, mois, annee, lignes: [], premiereLigne: i };
        groupes.set(cle, groupe);
      }

      const modePaiement = colMode ? String(row.getCell(colMode).value ?? '').trim() : '';
      if (modePaiement && !groupe.modePaiement) groupe.modePaiement = modePaiement;

      const libelle = colLibelle ? String(row.getCell(colLibelle).value ?? '').trim() : '';
      const gainBrut = colGain ? row.getCell(colGain).value : undefined;
      const retenueBrut = colRetenue ? row.getCell(colRetenue).value : undefined;
      const gain = gainBrut !== undefined && gainBrut !== null ? Number(gainBrut) : 0;
      const retenue = retenueBrut !== undefined && retenueBrut !== null ? Number(retenueBrut) : 0;
      const imposableBrut = colImposable ? String(row.getCell(colImposable).value ?? '').trim().toLowerCase() : '';
      const imposable = ['oui', 'yes', 'true', '1'].includes(imposableBrut);

      if (libelle && (gain > 0 || retenue > 0)) {
        groupe.lignes.push({ libelle, imposable, montantGain: gain, montantRetenue: retenue });
      }
    }

    let creees = 0;
    for (const groupe of groupes.values()) {
      try {
        await this.creerBulletin(
          ecoleId,
          {
            personnelId: groupe.personnelId,
            mois: groupe.mois,
            annee: groupe.annee,
            modePaiement: groupe.modePaiement,
            lignes: groupe.lignes,
          },
          creeParId,
        );
        creees += 1;
      } catch (e: any) {
        erreurs.push({ ligne: groupe.premiereLigne, motif: e?.message ?? 'Erreur lors de la création du bulletin' });
      }
    }

    return { creees, erreurs };
  }

  findByMois(ecoleId: string, mois: number, annee: number) {
    return this.prisma.bulletinPaie.findMany({
      where: { ecoleId, mois, annee },
      include: { personnel: true },
      orderBy: { personnel: { nom: 'asc' } },
    });
  }

  async findOne(ecoleId: string, id: string) {
    const bulletin = await this.prisma.bulletinPaie.findFirst({
      where: { id, ecoleId },
      include: { lignes: { orderBy: { ordre: 'asc' } }, personnel: true, ecole: true },
    });
    if (!bulletin) {
      throw new NotFoundException('Bulletin introuvable');
    }
    return bulletin;
  }

  async valider(ecoleId: string, id: string) {
    const bulletin = await this.prisma.bulletinPaie.findFirst({ where: { id, ecoleId } });
    if (!bulletin) {
      throw new NotFoundException('Bulletin introuvable');
    }
    if (bulletin.statut !== 'BROUILLON') {
      throw new BadRequestException('Seul un bulletin en brouillon peut être validé');
    }
    return this.prisma.bulletinPaie.update({ where: { id }, data: { statut: 'VALIDE' } });
  }

  async supprimer(ecoleId: string, id: string) {
    const bulletin = await this.prisma.bulletinPaie.findFirst({ where: { id, ecoleId } });
    if (!bulletin) {
      throw new NotFoundException('Bulletin introuvable');
    }
    if (bulletin.statut !== 'BROUILLON') {
      throw new BadRequestException('Seul un bulletin en brouillon peut être supprimé');
    }
    return this.prisma.bulletinPaie.delete({ where: { id } });
  }
}
