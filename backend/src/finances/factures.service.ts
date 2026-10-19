import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { Regime } from '../generated/prisma/enums';
import { CreateFactureDto } from './dto/facture.dto';
import { libelleFraisInscription, montantFraisInscription } from './inscription.util';
import { anneeEstCloturee, exigerAnneeOuverte } from '../common/annee-cloturee.util';

export interface ImportResultat {
  creees: number;
  erreurs: { ligne: number; motif: string }[];
}

@Injectable()
export class FacturesService {
  constructor(private prisma: PrismaService) {}

  async create(ecoleId: string, dto: CreateFactureDto) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: dto.eleveId, ecoleId } });

    let anneeScolaireId = dto.anneeScolaireId;
    if (!anneeScolaireId) {
      const anneeCourante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
      if (!anneeCourante) {
        throw new BadRequestException("Aucune année scolaire courante n'est définie");
      }
      anneeScolaireId = anneeCourante.id;
    }
    await exigerAnneeOuverte(this.prisma, anneeScolaireId, 'y créer une facture');

    return this.prisma.facture.create({
      data: {
        ecoleId,
        eleveId: dto.eleveId,
        anneeScolaireId,
        libelle: dto.libelle,
        montantTotal: dto.montantTotal,
        dateEcheance: dto.dateEcheance ? new Date(dto.dateEcheance) : undefined,
      },
    });
  }

  // Facturation automatique à l'inscription d'un élève dans une classe : frais
  // d'inscription (par niveau) + tarifs d'écolage (par niveau et régime, une ligne par
  // tarif défini). Idempotent par libellé : ne recrée pas une facture déjà émise pour cet
  // élève sur cette année scolaire, mais couvre les tarifs ajoutés après coup.
  async genererFacturesEnrolement(ecoleId: string, eleveId: string, classeId: string, anneeScolaireId: string) {
    const classe = await this.prisma.classe.findFirst({ where: { id: classeId, ecoleId } });
    if (!classe) return;
    if (await anneeEstCloturee(this.prisma, anneeScolaireId)) return; // année clôturée : plus de nouvelles factures

    // Réinscription si l'élève a déjà été inscrit une année scolaire antérieure
    // (peu importe la classe/le niveau) : le tarif de retour peut différer de
    // celui appliqué aux nouveaux admis.
    const inscriptionAnterieure = await this.prisma.inscription.findFirst({
      where: { ecoleId, eleveId, anneeScolaireId: { not: anneeScolaireId } },
    });
    const estReinscription = !!inscriptionAnterieure;

    // L'admission ne vaut plus paiement : la facture des frais d'inscription (ou de
    // réinscription) est créée au montant du niveau mais reste IMPAYÉE. L'encaissement se fait
    // ensuite avec l'option « Payer l'inscription » de la fiche élève (PaiementsService.payerInscription),
    // qui génère le reçu. On ne touche jamais à une facture d'inscription déjà existante.
    const defautNiveau = await this.prisma.fraisInscriptionNiveau.findFirst({
      where: { ecoleId, niveauId: classe.niveauId, anneeScolaireId },
    });
    const montantInscription = montantFraisInscription(defautNiveau, estReinscription);
    if (montantInscription > 0) {
      const factureExistante = await this.prisma.facture.findFirst({
        where: { ecoleId, eleveId, anneeScolaireId, type: 'INSCRIPTION' },
      });
      if (!factureExistante) {
        await this.prisma.facture.create({
          data: {
            ecoleId,
            eleveId,
            anneeScolaireId,
            libelle: libelleFraisInscription(estReinscription, classe.nom),
            type: 'INSCRIPTION',
            montantTotal: montantInscription,
          },
        });
      }
    }

    // Le régime (externat, semi-internat...) est porté par l'inscription de l'année ; un tarif
    // sans régime s'applique à tous les régimes du niveau.
    const inscription = await this.prisma.inscription.findFirst({ where: { ecoleId, eleveId, anneeScolaireId } });
    const regime = inscription?.regime ?? 'EXTERNAT';
    const tarifs = await this.prisma.tarifEcolage.findMany({
      where: { ecoleId, niveauId: classe.niveauId, anneeScolaireId, OR: [{ regime: null }, { regime }] },
    });
    for (const tarif of tarifs) {
      // Une facture annulée (changement de régime) ne compte pas : revenir au régime la réémet.
      const dejaFacture = await this.prisma.facture.findFirst({
        where: { ecoleId, eleveId, anneeScolaireId, type: 'ECOLAGE', libelle: tarif.libelle, statut: { not: 'ANNULEE' } },
      });
      if (!dejaFacture) {
        await this.prisma.facture.create({
          data: {
            ecoleId,
            eleveId,
            anneeScolaireId,
            libelle: tarif.libelle,
            type: 'ECOLAGE',
            montantTotal: tarif.montant,
            dateEcheance: tarif.dateEcheance,
          },
        });
      }
    }

    // Assurance scolaire annuelle (si un montant est configuré pour l'année)
    await this.facturerAssurance(ecoleId, eleveId, anneeScolaireId, classe.niveauId);
  }

  // Montant de l'assurance d'une année pour un niveau : celui de son cycle s'il est défini, sinon celui de
  // « tous les cycles » ; 0 si rien n'est configuré.
  async montantAssurance(ecoleId: string, anneeScolaireId: string, niveauId: string | null): Promise<number> {
    const tarifs = (await this.prisma.tarifAssurance.findMany({ where: { ecoleId, anneeScolaireId } })) ?? [];
    if (tarifs.length === 0) return 0;
    const niveau = niveauId ? await this.prisma.niveau.findFirst({ where: { id: niveauId, ecoleId } }) : null;
    const cycle = niveau?.cycle?.trim() ?? '';
    return (tarifs.find((t) => cycle && t.cycle === cycle) ?? tarifs.find((t) => t.cycle === ''))?.montant ?? 0;
  }

  // Une facture d'assurance par élève et par année (« Assurance scolaire 2026-2027 ») ; rien si elle existe déjà
  // (hors annulée), si aucun montant n'est configuré, ou si l'année est clôturée. Renvoie la facture créée.
  async facturerAssurance(ecoleId: string, eleveId: string, anneeScolaireId: string, niveauId: string | null) {
    if (await anneeEstCloturee(this.prisma, anneeScolaireId)) return null;
    const existante = await this.prisma.facture.findFirst({
      where: { ecoleId, eleveId, anneeScolaireId, type: 'ASSURANCE', statut: { not: 'ANNULEE' } },
    });
    if (existante) return null;
    const montant = await this.montantAssurance(ecoleId, anneeScolaireId, niveauId);
    if (montant <= 0) return null;
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } });
    return this.prisma.facture.create({
      data: {
        ecoleId,
        eleveId,
        anneeScolaireId,
        libelle: `T-shirt ${annee?.libelle ?? ''}`.trim(),
        type: 'ASSURANCE',
        montantTotal: montant,
      },
    });
  }

  // Changement de régime en cours d'année : les factures d'écolage propres à l'ancien régime
  // passent ANNULÉE (les tarifs « tous régimes » restent dus). Refusé si l'une d'elles a déjà
  // reçu un paiement, pour ne jamais faire disparaître un encaissement.
  async annulerEcolageRegime(
    ecoleId: string,
    eleveId: string,
    anneeScolaireId: string,
    niveauId: string,
    ancienRegime: Regime,
  ) {
    const tarifs = await this.prisma.tarifEcolage.findMany({
      where: { ecoleId, niveauId, anneeScolaireId, regime: ancienRegime },
    });
    if (tarifs.length === 0) return;

    const factures = await this.prisma.facture.findMany({
      where: {
        ecoleId,
        eleveId,
        anneeScolaireId,
        type: 'ECOLAGE',
        libelle: { in: tarifs.map((t) => t.libelle) },
        statut: { not: 'ANNULEE' },
      },
    });
    const payees = factures.filter((f) => Number(f.montantPaye) > 0);
    if (payees.length > 0) {
      throw new BadRequestException(
        `Changement de régime impossible : des paiements sont déjà enregistrés sur ${payees.map((f) => `« ${f.libelle} »`).join(', ')}`,
      );
    }
    if (factures.length > 0) {
      await this.prisma.facture.updateMany({
        where: { id: { in: factures.map((f) => f.id) } },
        data: { statut: 'ANNULEE' },
      });
    }
  }

  // Rattrape les factures d'écolage / inscription manquantes pour tous les élèves déjà
  // inscrits (ex: tarif ajouté après coup, ou élèves inscrits avant l'automatisation).
  async regenererFacturesManquantes(ecoleId: string, anneeScolaireId?: string) {
    let annee = anneeScolaireId;
    if (!annee) {
      const anneeCourante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
      if (!anneeCourante) {
        throw new BadRequestException("Aucune année scolaire courante n'est définie");
      }
      annee = anneeCourante.id;
    }
    await exigerAnneeOuverte(this.prisma, annee, 'y générer des factures');

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: annee, statut: 'EN_COURS' },
    });

    let traites = 0;
    for (const inscription of inscriptions) {
      await this.genererFacturesEnrolement(ecoleId, inscription.eleveId, inscription.classeId, annee);
      traites += 1;
    }
    return { eleveTraites: traites };
  }

  async findOne(ecoleId: string, id: string) {
    return this.prisma.facture.findFirstOrThrow({
      where: { id, ecoleId },
      include: { eleve: true, ecole: true, paiements: { orderBy: { datePaiement: 'desc' } } },
    });
  }

  // Factures non soldées. Par défaut toutes les années : les arriérés d'une année passée restent dus et
  // doivent rester visibles (et relançables) après le passage à l'année suivante. Chaque facture porte son
  // année et `arriere` (année antérieure à l'année courante, à défaut la plus récente).
  //   portee COURANTE : l'année courante seule (périmètre du tableau de bord et de l'export « impayés »)
  //   portee ARRIERES : les années antérieures seules
  async findImpayes(ecoleId: string, portee: 'TOUTES' | 'COURANTE' | 'ARRIERES' = 'TOUTES') {
    const annee =
      (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } })) ??
      (await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } }));

    const factures = await this.prisma.facture.findMany({
      where: {
        ecoleId,
        statut: { in: ['IMPAYEE', 'PARTIELLE'] },
        ...(portee === 'COURANTE' ? { anneeScolaireId: annee?.id } : {}),
        ...(portee === 'ARRIERES' && annee ? { anneeScolaire: { dateDebut: { lt: annee.dateDebut } } } : {}),
      },
      include: { eleve: true, anneeScolaire: { select: { id: true, libelle: true, dateDebut: true } } },
      orderBy: [{ anneeScolaire: { dateDebut: 'asc' } }, { dateEcheance: 'asc' }],
    });
    return factures.map(({ anneeScolaire, ...f }) => ({
      ...f,
      anneeScolaire: anneeScolaire ? { id: anneeScolaire.id, libelle: anneeScolaire.libelle } : null,
      arriere: !!annee && !!anneeScolaire && anneeScolaire.dateDebut < annee.dateDebut,
    }));
  }

  // Import en masse de factures ponctuelles (cantine, transport, pénalités...) depuis un
  // fichier Excel. Colonnes attendues : Matricule (ou Nom + Prénom), Libellé, Montant,
  // Date échéance (optionnelle). Un élève introuvable ou une ligne invalide est reportée
  // dans `erreurs` sans bloquer l'import des autres lignes.
  async importXlsx(ecoleId: string, buffer: Buffer): Promise<ImportResultat> {
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
    const colLibelle = colonnes.get('libellé') ?? colonnes.get('libelle');
    const colMontant = colonnes.get('montant');
    const colEcheance = colonnes.get('date échéance') ?? colonnes.get('date echeance') ?? colonnes.get('échéance');

    if (!colLibelle || !colMontant || (!colMatricule && !(colNom && colPrenom))) {
      throw new BadRequestException(
        'Colonnes attendues : Matricule (ou Nom + Prénom), Libellé, Montant, Date échéance (optionnelle)',
      );
    }

    const anneeCourante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (!anneeCourante) {
      throw new BadRequestException("Aucune année scolaire courante n'est définie");
    }

    const eleves = await this.prisma.eleve.findMany({ where: { ecoleId, actif: true } });
    const parMatricule = new Map(
      eleves.filter((e) => e.matricule).map((e) => [e.matricule!.trim().toLowerCase(), e]),
    );
    const parNomPrenom = new Map(
      eleves.map((e) => [`${e.nom.trim().toLowerCase()}|${e.prenom.trim().toLowerCase()}`, e]),
    );

    let creees = 0;
    const erreurs: { ligne: number; motif: string }[] = [];

    for (let i = 2; i <= sheet.rowCount; i++) {
      const row = sheet.getRow(i);
      if (row.actualCellCount === 0) continue;

      const matricule = colMatricule ? String(row.getCell(colMatricule).value ?? '').trim() : '';
      const nom = colNom ? String(row.getCell(colNom).value ?? '').trim() : '';
      const prenom = colPrenom ? String(row.getCell(colPrenom).value ?? '').trim() : '';
      const libelle = String(row.getCell(colLibelle).value ?? '').trim();
      const montantBrut = row.getCell(colMontant).value;
      const montant = typeof montantBrut === 'number' ? montantBrut : Number(montantBrut);

      if (!matricule && !nom && !prenom && !libelle) continue;

      const eleve =
        (matricule && parMatricule.get(matricule.toLowerCase())) ||
        (nom && prenom && parNomPrenom.get(`${nom.toLowerCase()}|${prenom.toLowerCase()}`));

      if (!eleve) {
        erreurs.push({ ligne: i, motif: `Élève introuvable (${matricule || `${nom} ${prenom}`})` });
        continue;
      }
      if (!libelle) {
        erreurs.push({ ligne: i, motif: 'Libellé manquant' });
        continue;
      }
      if (!montant || montant <= 0) {
        erreurs.push({ ligne: i, motif: 'Montant invalide' });
        continue;
      }

      let dateEcheance: Date | undefined;
      if (colEcheance) {
        const brut = row.getCell(colEcheance).value;
        if (brut instanceof Date) dateEcheance = brut;
        else if (typeof brut === 'string' && brut.trim()) {
          const parsed = new Date(brut);
          if (!isNaN(parsed.getTime())) dateEcheance = parsed;
        }
      }

      await this.prisma.facture.create({
        data: {
          ecoleId,
          eleveId: eleve.id,
          anneeScolaireId: anneeCourante.id,
          libelle,
          type: 'AUTRE',
          montantTotal: montant,
          dateEcheance,
        },
      });
      creees += 1;
    }

    return { creees, erreurs };
  }

  async soldeEleve(ecoleId: string, eleveId: string) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });
    const factures = await this.prisma.facture.findMany({ where: { ecoleId, eleveId, statut: { not: 'ANNULEE' } } });
    const solde = factures.reduce((acc, f) => acc + (Number(f.montantTotal) - Number(f.montantPaye)), 0);
    return { eleveId, solde };
  }
}
