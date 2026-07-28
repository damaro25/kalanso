import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFactureDto } from './dto/facture.dto';

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
  // d'inscription (par niveau) + tarifs d'écolage (par niveau, une ligne par tarif
  // défini). Idempotent par libellé : ne recrée pas une facture déjà émise pour cet
  // élève sur cette année scolaire, mais couvre les tarifs ajoutés après coup.
  async genererFacturesEnrolement(ecoleId: string, eleveId: string, classeId: string, anneeScolaireId: string) {
    const classe = await this.prisma.classe.findFirst({ where: { id: classeId, ecoleId } });
    if (!classe) return;

    // Une inscription acceptée vaut paiement des frais d'inscription : contrairement à
    // l'écolage (suivi progressivement au fil des paiements réels), ce frais est réputé
    // réglé au moment de l'admission — la facture est créée directement soldée, avec son
    // paiement en espèces associé pour que l'encaissement remonte correctement dans la
    // trésorerie et le compte de résultat.
    const defautNiveau = await this.prisma.fraisInscriptionNiveau.findFirst({
      where: { ecoleId, niveauId: classe.niveauId, anneeScolaireId },
    });
    const montantInscription = defautNiveau ? Number(defautNiveau.montant) : 0;
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
            libelle: `Frais d'inscription - ${classe.nom}`,
            type: 'INSCRIPTION',
            montantTotal: montantInscription,
            montantPaye: montantInscription,
            statut: 'PAYEE',
            paiements: {
              create: {
                ecoleId,
                montant: montantInscription,
                mode: 'ESPECES',
                reference: "Réglé à l'inscription",
              },
            },
          },
        });
      } else if (Number(factureExistante.montantPaye) < Number(factureExistante.montantTotal)) {
        // Facture d'inscription générée avant cette règle et encore (partiellement) impayée :
        // on la solde, avec le paiement correspondant pour garder la trésorerie cohérente.
        const reste = Number(factureExistante.montantTotal) - Number(factureExistante.montantPaye);
        await this.prisma.facture.update({
          where: { id: factureExistante.id },
          data: {
            montantPaye: factureExistante.montantTotal,
            statut: 'PAYEE',
            paiements: {
              create: {
                ecoleId,
                montant: reste,
                mode: 'ESPECES',
                reference: "Réglé à l'inscription (régularisation)",
              },
            },
          },
        });
      }
    }

    const tarifs = await this.prisma.tarifEcolage.findMany({
      where: { ecoleId, niveauId: classe.niveauId, anneeScolaireId },
    });
    for (const tarif of tarifs) {
      const dejaFacture = await this.prisma.facture.findFirst({
        where: { ecoleId, eleveId, anneeScolaireId, type: 'ECOLAGE', libelle: tarif.libelle },
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
          },
        });
      }
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

  findImpayes(ecoleId: string) {
    return this.prisma.facture.findMany({
      where: { ecoleId, statut: { in: ['IMPAYEE', 'PARTIELLE'] } },
      include: { eleve: true },
      orderBy: { dateEcheance: 'asc' },
    });
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
    const factures = await this.prisma.facture.findMany({ where: { ecoleId, eleveId } });
    const solde = factures.reduce((acc, f) => acc + (Number(f.montantTotal) - Number(f.montantPaye)), 0);
    return { eleveId, solde };
  }
}
