import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { RecuData } from './recu.util';
import { formaterNumeroRecu } from './numero-recu.util';

const LIBELLES_MODE: Record<string, string> = {
  ESPECES: 'Espèces',
  VIREMENT: 'Virement',
  CHEQUE: 'Chèque',
  MOBILE_MONEY: 'Mobile Money',
  AUTRE: 'Autre',
};
import { estAnterieure, exigerTranchesPrecedentesSoldees } from './ordre-tranches.util';
import { codeSuppressionValide } from '../finance/code-suppression';
import { CreatePaiementDto } from './dto/paiement.dto';
import { ModePaiement, StatutFacture } from '../generated/prisma/enums';
import { libelleFraisInscription, montantFraisInscription } from './inscription.util';
import { typeOperation } from './type-operation.util';
import { detailResteAPayer, pourGroupe } from './reste-recu.util';

export type TypeInscription = 'INSCRIPTION' | 'REINSCRIPTION';
export type EtatInscription = 'A_PAYER' | 'PAYEE' | 'FRAIS_NON_DEFINIS';

const libelleType = (type: TypeInscription) => (type === 'REINSCRIPTION' ? 'Réinscription' : 'Inscription');

// Type de la facture d'inscription d'après son libellé (« Frais de réinscription - ... »).
const typeDeLaFacture = (facture: { libelle?: string | null }): TypeInscription =>
  typeOperation({ type: 'INSCRIPTION', libelle: facture.libelle ?? '' }) === 'Réinscription' ? 'REINSCRIPTION' : 'INSCRIPTION';

@Injectable()
export class PaiementsService {
  constructor(private prisma: PrismaService) {}

  async create(ecoleId: string, dto: CreatePaiementDto, saisieParId: string) {
    // Rejeu d'une requête hors-ligne déjà passée (réponse perdue en route) :
    // on ne recrée pas le paiement, on renvoie celui qui existe déjà.
    if (dto.id) {
      const existant = await this.prisma.paiement.findUnique({ where: { id: dto.id } });
      if (existant) return existant;
    }

    const facture = await this.prisma.facture.findFirstOrThrow({ where: { id: dto.factureId, ecoleId } });
    await exigerTranchesPrecedentesSoldees(this.prisma, facture);

    const nouveauMontantPaye = Number(facture.montantPaye) + dto.montant;
    if (nouveauMontantPaye > Number(facture.montantTotal)) {
      throw new BadRequestException('Le montant payé dépasserait le montant total de la facture');
    }

    const nouveauStatut: StatutFacture =
      nouveauMontantPaye >= Number(facture.montantTotal) ? 'PAYEE' : 'PARTIELLE';

    const [paiement] = await this.prisma.$transaction([
      this.prisma.paiement.create({
        data: {
          id: dto.id,
          ecoleId,
          factureId: facture.id,
          montant: dto.montant,
          mode: dto.mode,
          reference: dto.reference,
          saisieParId,
        },
      }),
      this.prisma.facture.update({
        where: { id: facture.id },
        data: { montantPaye: nouveauMontantPaye, statut: nouveauStatut },
      }),
    ]);

    return paiement;
  }

  // Annulation de paiements par le fondateur (code à 4 chiffres et motif exigés). Chaque paiement est retiré et sa
  // copie gardée dans PaiementAnnule : le montant payé et le statut des factures se recalculent, et tout ce qui
  // additionne les paiements (reste à payer, comptes, bordereau, reçus groupés « lot:… ») suit sans autre changement.
  // On peut annuler une opération entière ou seulement certains de ses éléments, d'un seul élève à la fois.
  async annuler(ecoleId: string, paiementIds: string[], motif: string, annuleParId: string, code?: string) {
    if (!codeSuppressionValide(code)) {
      throw new ForbiddenException(code ? 'Code incorrect' : 'Le code à 4 chiffres est requis pour annuler un paiement');
    }
    const raison = motif?.trim();
    if (!raison) throw new BadRequestException("Indiquez le motif de l'annulation");
    const ids = [...new Set(paiementIds ?? [])];
    if (!ids.length) throw new BadRequestException('Aucun paiement à annuler');

    const paiements = await this.prisma.paiement.findMany({ where: { id: { in: ids }, ecoleId }, include: { facture: true } });
    if (paiements.length !== ids.length) {
      throw new NotFoundException('Paiement introuvable : il a peut-être déjà été annulé');
    }
    const eleveId = paiements[0].facture.eleveId;
    if (paiements.some((p) => p.facture.eleveId !== eleveId)) {
      throw new BadRequestException("Les paiements à annuler doivent concerner un seul élève");
    }

    const retire = new Map<string, number>();
    for (const p of paiements) retire.set(p.factureId, (retire.get(p.factureId) ?? 0) + Number(p.montant));

    // Les tranches se paient dans l'ordre : une tranche ne redevient pas due tant qu'une tranche suivante garde un versement.
    const ecolages = await this.prisma.facture.findMany({
      where: { ecoleId, eleveId, type: 'ECOLAGE', statut: { not: 'ANNULEE' } },
      select: { id: true, libelle: true, dateEcheance: true, anneeScolaireId: true, montantTotal: true, montantPaye: true },
    });
    const payeApres = (f: { id: string; montantPaye: unknown }) => Number(f.montantPaye) - (retire.get(f.id) ?? 0);
    for (const f of ecolages) {
      if (!retire.has(f.id) || payeApres(f) >= Number(f.montantTotal)) continue;
      const suivante = ecolages.find((g) => g.anneeScolaireId === f.anneeScolaireId && g.id !== f.id && estAnterieure(f, g) && payeApres(g) > 0);
      if (suivante) {
        throw new BadRequestException(`Annulez d'abord les paiements de « ${suivante.libelle} » : les tranches se paient dans l'ordre.`);
      }
    }

    await this.prisma.$transaction(
      async (tx) => {
        for (const p of paiements) {
          await tx.paiementAnnule.create({
            data: {
              ecoleId,
              eleveId,
              factureId: p.factureId,
              factureLibelle: p.facture.libelle,
              paiementId: p.id,
              numero: p.numero,
              montant: p.montant,
              mode: p.mode,
              reference: p.reference,
              datePaiement: p.datePaiement,
              saisieParId: p.saisieParId,
              motif: raison,
              annuleParId,
            },
          });
        }
        await tx.transactionMobileMoney.updateMany({ where: { paiementId: { in: ids } }, data: { paiementId: null } });
        await tx.paiement.deleteMany({ where: { id: { in: ids }, ecoleId } });
        for (const factureId of retire.keys()) {
          const facture = paiements.find((p) => p.factureId === factureId)!.facture;
          const somme = await tx.paiement.aggregate({ where: { factureId }, _sum: { montant: true } });
          const paye = Number(somme._sum.montant ?? 0);
          const statut: StatutFacture =
            facture.statut === 'ANNULEE' ? 'ANNULEE' : paye <= 0 ? 'IMPAYEE' : paye >= Number(facture.montantTotal) ? 'PAYEE' : 'PARTIELLE';
          await tx.facture.update({ where: { id: factureId }, data: { montantPaye: paye, statut } });
        }
      },
      { timeout: 60_000 },
    );

    return { annules: paiements.length, montant: paiements.reduce((a, p) => a + Number(p.montant), 0) };
  }

  // ── Paiement de l'inscription / de la réinscription ──
  // L'admission crée la facture d'inscription mais ne l'encaisse plus : on la règle ici, au montant exact
  // du niveau de la classe de l'élève. Le type d'opération (inscription ou réinscription) est détecté
  // (réinscription si l'élève a déjà été inscrit une autre année) mais le caissier peut le choisir : la
  // première année dans l'application, un élève qui revient n'a aucune inscription antérieure enregistrée.
  // Le type reste modifiable tant que rien n'a été versé sur la facture, puis il est figé.

  private async contexteInscription(ecoleId: string, eleveId: string, typeChoisi?: TypeInscription) {
    await this.prisma.eleve.findFirstOrThrow({ where: { id: eleveId, ecoleId } });

    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (!annee) {
      throw new BadRequestException("Aucune année scolaire courante n'est définie");
    }
    const inscription = await this.prisma.inscription.findFirst({
      where: { ecoleId, eleveId, anneeScolaireId: annee.id, statut: 'EN_COURS' },
      include: { classe: { include: { niveau: true } } },
    });
    if (!inscription) {
      throw new BadRequestException("Cet élève n'est inscrit dans aucune classe pour l'année scolaire courante");
    }

    // Réinscription détectée : l'élève a déjà été inscrit lors d'une autre année scolaire.
    const anterieure = await this.prisma.inscription.findFirst({
      where: { ecoleId, eleveId, anneeScolaireId: { not: annee.id } },
    });
    const detectee: TypeInscription = anterieure ? 'REINSCRIPTION' : 'INSCRIPTION';

    const frais = await this.prisma.fraisInscriptionNiveau.findFirst({
      where: { ecoleId, niveauId: inscription.classe.niveauId, anneeScolaireId: annee.id },
    });
    const montants = { INSCRIPTION: montantFraisInscription(frais, false), REINSCRIPTION: montantFraisInscription(frais, true) };
    const facture = await this.prisma.facture.findFirst({
      where: { ecoleId, eleveId, anneeScolaireId: annee.id, type: 'INSCRIPTION', statut: { not: 'ANNULEE' } },
    });

    const dejaPaye = facture ? Number(facture.montantPaye) : 0;
    const typeFacture = facture ? typeDeLaFacture(facture) : null;
    const typeInitial = typeFacture ?? detectee;
    const typeModifiable = dejaPaye === 0;
    const type = typeChoisi && typeModifiable ? typeChoisi : typeInitial;
    const typeRefuse = !!typeChoisi && !typeModifiable && typeChoisi !== typeInitial;
    const typeChange = !!facture && type !== typeFacture;

    // La facture déjà générée à l'admission fait foi pour le montant tant que son type n'est pas changé ;
    // sinon, le tarif du niveau pour le type choisi.
    const montant = facture && !typeChange ? Number(facture.montantTotal) : montants[type];
    const verse = typeChange ? 0 : dejaPaye;
    const reste = montant - verse;
    const etat: EtatInscription = facture && !typeChange && reste <= 0 ? 'PAYEE' : montant <= 0 ? 'FRAIS_NON_DEFINIS' : 'A_PAYER';

    return { annee, classe: inscription.classe, facture, type, typeModifiable, typeRefuse, typeChange, montants, montant, dejaPaye: verse, reste, etat };
  }

  // Ce qu'il y a à payer pour l'inscription (ou la réinscription) de l'élève, pour afficher le bouton.
  // `montants` donne le frais du niveau pour chaque type, pour que l'écran puisse proposer le choix.
  async apercuInscription(ecoleId: string, eleveId: string) {
    const c = await this.contexteInscription(ecoleId, eleveId);
    return {
      eleveId,
      anneeScolaire: { id: c.annee.id, libelle: c.annee.libelle },
      classe: c.classe.nom,
      niveau: c.classe.niveau.nom,
      type: c.type,
      libelle: libelleType(c.type),
      typeModifiable: c.typeModifiable,
      montants: c.montants,
      factureId: c.facture?.id ?? null,
      montant: c.montant,
      dejaPaye: c.dejaPaye,
      reste: c.reste,
      etat: c.etat,
    };
  }

  // Liste de travail du caissier : les élèves inscrits en classe cette année et l'état de leur inscription
  // ou réinscription (à payer, payée, ou frais non définis pour leur niveau), filtrable par niveau, classe,
  // type d'opération et état. Le montant et le type sont calculés comme dans apercuInscription, mais en lot.
  async inscriptionsAPayer(
    ecoleId: string,
    filtres: { niveauId?: string; classeId?: string; type?: TypeInscription; etat?: EtatInscription | 'TOUS' } = {},
  ) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (!annee) {
      throw new BadRequestException("Aucune année scolaire courante n'est définie");
    }

    // Classes de l'année : elles alimentent aussi les listes déroulantes des filtres.
    const classes = await this.prisma.classe.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, actif: true },
      include: { niveau: true },
      orderBy: [{ niveau: { ordre: 'asc' } }, { nom: 'asc' }],
    });
    const niveaux = new Map<string, { id: string; nom: string }>();
    for (const c of classes) niveaux.set(c.niveauId, { id: c.niveauId, nom: c.niveau.nom });
    if (filtres.niveauId && !niveaux.has(filtres.niveauId)) {
      throw new BadRequestException('Niveau invalide');
    }
    if (filtres.classeId) {
      const classe = classes.find((c) => c.id === filtres.classeId);
      if (!classe) throw new BadRequestException('Classe invalide pour cette année scolaire');
      if (filtres.niveauId && classe.niveauId !== filtres.niveauId) {
        throw new BadRequestException("Cette classe n'appartient pas à ce niveau");
      }
    }

    const inscriptions = await this.prisma.inscription.findMany({
      where: {
        ecoleId,
        anneeScolaireId: annee.id,
        statut: 'EN_COURS',
        ...(filtres.classeId ? { classeId: filtres.classeId } : filtres.niveauId ? { classe: { niveauId: filtres.niveauId } } : {}),
      },
      select: {
        eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
        classe: { select: { id: true, nom: true, niveauId: true, niveau: { select: { nom: true, ordre: true } } } },
      },
    });
    const eleveIds = inscriptions.map((i) => i.eleve.id);

    const [anterieures, fraisParNiveau, factures] = eleveIds.length
      ? await Promise.all([
          this.prisma.inscription.findMany({
            where: { ecoleId, eleveId: { in: eleveIds }, anneeScolaireId: { not: annee.id } },
            select: { eleveId: true },
          }),
          this.prisma.fraisInscriptionNiveau.findMany({ where: { ecoleId, anneeScolaireId: annee.id } }),
          this.prisma.facture.findMany({
            where: { ecoleId, anneeScolaireId: annee.id, type: 'INSCRIPTION', statut: { not: 'ANNULEE' }, eleveId: { in: eleveIds } },
            select: { id: true, eleveId: true, libelle: true, montantTotal: true, montantPaye: true },
          }),
        ])
      : [[], [], []];
    const dejaInscrits = new Set(anterieures.map((a) => a.eleveId)); // réinscription détectée : inscrit une autre année
    const fraisDuNiveau = new Map(fraisParNiveau.map((f) => [f.niveauId, f]));
    const factureDeLEleve = new Map(factures.map((f) => [f.eleveId, f]));

    const toutes = inscriptions
      .map((i) => {
        const facture = factureDeLEleve.get(i.eleve.id);
        const frais = fraisDuNiveau.get(i.classe.niveauId);
        const montants = { INSCRIPTION: montantFraisInscription(frais, false), REINSCRIPTION: montantFraisInscription(frais, true) };
        // Le type de la facture déjà générée fait foi ; sans facture, le type détecté.
        const type: TypeInscription = facture ? typeDeLaFacture(facture) : dejaInscrits.has(i.eleve.id) ? 'REINSCRIPTION' : 'INSCRIPTION';
        const montant = facture ? Number(facture.montantTotal) : montants[type];
        const dejaPaye = facture ? Number(facture.montantPaye) : 0;
        const reste = montant - dejaPaye;
        const etat: EtatInscription = facture && reste <= 0 ? 'PAYEE' : !facture && montant <= 0 ? 'FRAIS_NON_DEFINIS' : 'A_PAYER';
        return {
          eleveId: i.eleve.id,
          matricule: i.eleve.matricule,
          nomComplet: `${i.eleve.prenom} ${i.eleve.nom}`,
          classeId: i.classe.id,
          classe: i.classe.nom,
          niveau: i.classe.niveau.nom,
          ordre: i.classe.niveau.ordre,
          type,
          libelle: libelleType(type),
          typeModifiable: dejaPaye === 0,
          montants,
          factureId: facture?.id ?? null,
          montant,
          dejaPaye,
          reste,
          etat,
        };
      })
      .sort((a, b) => a.ordre - b.ordre || a.classe.localeCompare(b.classe) || a.nomComplet.localeCompare(b.nomComplet))
      .map(({ ordre: _ordre, ...ligne }) => ligne);

    // Le filtre de type porte aussi sur le résumé ; seul l'état (à payer, payées...) ne le restreint pas.
    const base = filtres.type ? toutes.filter((l) => l.type === filtres.type) : toutes;
    const etat = filtres.etat ?? 'A_PAYER';
    const lignes = etat === 'TOUS' ? base : base.filter((l) => l.etat === etat);

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      filtres: {
        niveaux: Array.from(niveaux.values()),
        classes: classes.map((c) => ({ id: c.id, nom: c.nom, niveauId: c.niveauId })),
      },
      resume: {
        eleves: base.length,
        aPayer: base.filter((l) => l.etat === 'A_PAYER').length,
        payees: base.filter((l) => l.etat === 'PAYEE').length,
        fraisNonDefinis: base.filter((l) => l.etat === 'FRAIS_NON_DEFINIS').length,
        resteTotal: base.filter((l) => l.etat === 'A_PAYER').reduce((a, l) => a + l.reste, 0),
        encaisse: base.reduce((a, l) => a + l.dejaPaye, 0),
      },
      lignes,
    };
  }

  // Fenêtre « Payer » : le caissier choisit inscription ou réinscription tant que rien n'a été versé. La facture
  // (créée au besoin) prend le libellé et le montant du type choisi ; le versement se fait ensuite comme une autre facture.
  async changerTypeInscription(ecoleId: string, eleveId: string, type: TypeInscription) {
    const c = await this.contexteInscription(ecoleId, eleveId, type);
    if (c.typeRefuse) {
      throw new BadRequestException("Le type d'opération ne peut plus être changé : un versement a déjà été enregistré sur cette facture");
    }
    if (c.etat === 'FRAIS_NON_DEFINIS') {
      throw new BadRequestException(
        `Aucun frais ${type === 'REINSCRIPTION' ? 'de réinscription' : "d'inscription"} n'est défini pour le niveau ${c.classe.niveau.nom}`,
      );
    }
    const data = { libelle: libelleFraisInscription(type === 'REINSCRIPTION', c.classe.nom), montantTotal: c.montant };
    if (!c.facture) {
      await this.prisma.facture.create({ data: { ecoleId, eleveId, anneeScolaireId: c.annee.id, type: 'INSCRIPTION', ...data } });
    } else if (c.typeChange) {
      await this.prisma.facture.update({ where: { id: c.facture.id }, data });
    }
    return this.apercuInscription(ecoleId, eleveId);
  }

  // `type` : inscription ou réinscription choisie par le caissier ; à défaut, celle détectée / de la facture.
  async payerInscription(ecoleId: string, eleveId: string, saisieParId: string, mode?: ModePaiement, type?: TypeInscription) {
    const c = await this.contexteInscription(ecoleId, eleveId, type);
    if (c.typeRefuse) {
      throw new BadRequestException("Le type d'opération ne peut plus être changé : un versement a déjà été enregistré sur cette facture");
    }
    if (c.etat === 'PAYEE') {
      throw new BadRequestException("Les frais d'inscription de cet élève sont déjà payés");
    }
    if (c.etat === 'FRAIS_NON_DEFINIS') {
      throw new BadRequestException(
        `Aucun frais d'inscription n'est défini pour le niveau ${c.classe.niveau.nom} : renseignez-le dans la page Tarifs`,
      );
    }

    const estReinscription = c.type === 'REINSCRIPTION';
    let factureId = c.facture?.id;
    if (!factureId) {
      const creee = await this.prisma.facture.create({
        data: {
          ecoleId,
          eleveId,
          anneeScolaireId: c.annee.id,
          libelle: libelleFraisInscription(estReinscription, c.classe.nom),
          type: 'INSCRIPTION',
          montantTotal: c.montant,
        },
      });
      factureId = creee.id;
    } else if (c.typeChange) {
      // Rien n'a encore été versé : la facture générée à l'admission prend le libellé et le montant du type choisi.
      await this.prisma.facture.update({
        where: { id: factureId },
        data: { libelle: libelleFraisInscription(estReinscription, c.classe.nom), montantTotal: c.montant },
      });
    }

    const paiement = await this.create(
      ecoleId,
      { factureId, montant: c.reste, mode, reference: libelleType(c.type) },
      saisieParId,
    );
    return { paiement, factureId, type: c.type, montant: c.reste };
  }

  // Tout ce qu'imprime le reçu (modèle du carnet papier) : élève, matricule, niveau, régime, cycle, et ce qui
  // reste dû par l'élève sur l'année de la facture (avec la prochaine échéance).
  async donneesRecu(ecoleId: string, id: string): Promise<RecuData> {
    const paiement = await this.findOne(ecoleId, id);
    const { facture } = paiement;
    // Plusieurs éléments payés en une fois depuis la fenêtre Payer (même référence « lot:… ») : un seul reçu,
    // pour le total, au numéro du premier paiement.
    const lot = paiement.reference?.startsWith('lot:')
      ? await this.prisma.paiement.findMany({
          where: { ecoleId, reference: paiement.reference },
          include: { facture: { select: { type: true, libelle: true } } },
          orderBy: [{ datePaiement: 'asc' }, { createdAt: 'asc' }],
        })
      : [];
    const groupe = lot.length > 1 ? lot : null;
    const [inscription, facturesAnnee] = await Promise.all([
      this.prisma.inscription.findFirst({
        where: { eleveId: facture.eleveId, anneeScolaireId: facture.anneeScolaireId },
        include: { classe: { include: { niveau: true } } },
      }),
      this.prisma.facture.findMany({
        where: { ecoleId, eleveId: facture.eleveId, anneeScolaireId: facture.anneeScolaireId, statut: { not: 'ANNULEE' } },
        select: {
          type: true,
          libelle: true,
          montantTotal: true,
          dateEcheance: true,
          createdAt: true,
          paiements: { select: { montant: true, datePaiement: true } },
        },
      }),
    ]);
    const niveau = inscription?.classe.niveau;
    const nom = `${niveau?.nom ?? ''} ${niveau?.cycle ?? ''}`;
    const cycle = /cr[eè]che/i.test(nom)
      ? 'CRECHE'
      : /garderie/i.test(nom)
        ? 'GARDERIE'
        : /maternelle/i.test(nom)
          ? 'MATERNELLE'
          : /primaire/i.test(nom)
            ? 'PRIMAIRE'
            : null;
    // Reste à payer tel qu'il était à la seconde où le reçu a été émis (même réimprimé plus tard) : seuls comptent
    // les factures déjà créées et les versements faits jusqu'à cet instant.
    const instant = Math.floor(Math.max(...(groupe ?? [paiement]).map((p) => new Date(p.datePaiement).getTime())) / 1000);
    const avant = (d: Date) => Math.floor(new Date(d).getTime() / 1000) <= instant;
    const dues = (facturesAnnee ?? [])
      .filter((f) => !f.createdAt || avant(f.createdAt))
      .map((f) => ({ ...f, montantPaye: (f.paiements ?? []).filter((p) => avant(p.datePaiement)).reduce((a, p) => a + Number(p.montant), 0) }))
      .filter((f) => Number(f.montantTotal) > f.montantPaye);
    const echeances = dues.map((f) => f.dateEcheance).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime());
    const ecole = facture.ecole;
    return {
      numero: formaterNumeroRecu(groupe ? groupe[0] : paiement),
      entete: {
        ministere: ecole.carteRetraitMinistere?.trim() || 'MEN-A',
        dev: ecole.carteRetraitDev?.trim() || 'Conakry',
        dce: ecole.carteRetraitDce?.trim() || 'Matoto',
      },
      adresse: `Matoto – Kissosso Tel : ${ecole.telephone?.trim() || '655 54 07 03 / 622 14 91 07 / 622 19 30 28 / 628 04 66 12'}`,
      email: ecole.email?.trim() || 'mametahold016@gmail.com',
      eleveNom: facture.eleve.nom,
      elevePrenom: facture.eleve.prenom,
      matricule: facture.eleve.matricule,
      niveau: niveau?.nom ?? null,
      cycle,
      regime: inscription?.regime ?? null,
      factureLibelle: groupe ? pourGroupe(groupe.map((p) => p.facture)) : facture.libelle,
      montant: groupe ? groupe.reduce((acc, p) => acc + Number(p.montant), 0) : Number(paiement.montant),
      mode: LIBELLES_MODE[paiement.mode] ?? paiement.mode,
      resteAPayer: dues.reduce((acc, f) => acc + Number(f.montantTotal) - Number(f.montantPaye), 0),
      resteDetail: detailResteAPayer(dues),
      prochaineEcheance: echeances[0] ?? null,
      datePaiement: paiement.datePaiement,
    };
  }

  async findOne(ecoleId: string, id: string) {
    return this.prisma.paiement.findFirstOrThrow({
      where: { id, ecoleId },
      include: { facture: { include: { eleve: true, ecole: true } } },
    });
  }
}
