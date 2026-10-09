import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePaiementDto } from './dto/paiement.dto';
import { ModePaiement, StatutFacture } from '../generated/prisma/enums';
import { libelleFraisInscription, montantFraisInscription } from './inscription.util';
import { typeOperation } from './type-operation.util';

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

  async findOne(ecoleId: string, id: string) {
    return this.prisma.paiement.findFirstOrThrow({
      where: { id, ecoleId },
      include: { facture: { include: { eleve: true, ecole: true } } },
    });
  }
}
