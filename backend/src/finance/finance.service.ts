import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { codeSuppressionValide } from './code-suppression';
import { estFraisEtudes, typeOperation, type TypeOperation } from '../finances/type-operation.util';

export interface LigneBordereau {
  numeroRecu: string; // N° du reçu = identifiant du paiement
  numeroFacture: string; // N° de la facture réglée
  eleveId: string;
  matricule: string | null;
  nomComplet: string;
  classe: string;
  niveau: string;
  typeOperation: TypeOperation;
  fraisEtudes: number; // le montant, quand l'opération est de l'écolage ou un trimestre
  totalPaye: number;
  date: string; // AAAA-MM-JJ
  observation: string; // mode de paiement
}
type Ligne = LigneBordereau;

const MOIS_LABELS = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
];

@Injectable()
export class FinanceService {
  constructor(private prisma: PrismaService) {}

  private async resoudreAnnee(ecoleId: string, anneeScolaireId?: string) {
    if (anneeScolaireId) {
      const a = await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } });
      if (!a) throw new BadRequestException('Année scolaire invalide');
      return a;
    }
    const courante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    if (courante) return courante;
    // à défaut, la plus récente
    const derniere = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId }, orderBy: { dateDebut: 'desc' } });
    if (!derniere) throw new BadRequestException("Aucune année scolaire définie");
    return derniere;
  }

  // Bornes [début, fin exclusive) de l'année scolaire, pour filtrer les
  // enregistrements horodatés (paiements, mouvements).
  private plageAnnee(annee: { dateDebut: Date; dateFin: Date }) {
    const debut = new Date(annee.dateDebut);
    const fin = new Date(annee.dateFin);
    fin.setDate(fin.getDate() + 1); // inclut toute la dernière journée
    return { debut, fin };
  }

  // Liste chronologique des mois (mois civil + année civile) couverts par
  // l'année scolaire — utile car elle chevauche deux années civiles (ex:
  // Octobre 2026 à Juillet 2027) et ses mois ne sont donc pas Janvier-Décembre.
  private moisDeAnnee(annee: { dateDebut: Date; dateFin: Date }) {
    const debut = new Date(annee.dateDebut);
    const finMois = new Date(annee.dateFin);
    const mois: { annee: number; mois: number; libelle: string }[] = [];
    let cur = new Date(debut.getFullYear(), debut.getMonth(), 1);
    const limite = new Date(finMois.getFullYear(), finMois.getMonth(), 1);
    while (cur <= limite) {
      mois.push({ annee: cur.getFullYear(), mois: cur.getMonth() + 1, libelle: MOIS_LABELS[cur.getMonth()] });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return mois;
  }

  // Tableau de bord financier global du fondateur.
  async dashboard(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);

    const factures = await this.prisma.facture.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: { not: 'ANNULEE' } },
    });

    const facturesEcolage = factures.filter((f) => f.type !== 'INSCRIPTION');
    const facturesInscription = factures.filter((f) => f.type === 'INSCRIPTION');

    const totalFacture = facturesEcolage.reduce((a, f) => a + Number(f.montantTotal), 0);
    const totalEncaisse = facturesEcolage.reduce((a, f) => a + Number(f.montantPaye), 0);
    const totalRestant = totalFacture - totalEncaisse;

    const totalFactureInscription = facturesInscription.reduce((a, f) => a + Number(f.montantTotal), 0);
    const totalEncaisseInscription = facturesInscription.reduce((a, f) => a + Number(f.montantPaye), 0);
    const totalRestantInscription = totalFactureInscription - totalEncaisseInscription;
    const tauxRecouvrementInscription =
      totalFactureInscription > 0 ? (totalEncaisseInscription / totalFactureInscription) * 100 : 0;

    // Reste par élève (écolage + inscription confondus, pour le statut de paiement global)
    const resteParEleve = new Map<string, number>();
    for (const f of factures) {
      const reste = Number(f.montantTotal) - Number(f.montantPaye);
      resteParEleve.set(f.eleveId, (resteParEleve.get(f.eleveId) ?? 0) + reste);
    }

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS' },
      select: { eleveId: true },
    });
    const nbInscrits = inscriptions.length;
    const inscritsIds = new Set(inscriptions.map((i) => i.eleveId));

    let nbAJour = 0;
    let nbEnRetard = 0;
    for (const eleveId of inscritsIds) {
      const reste = resteParEleve.get(eleveId);
      if (reste === undefined) continue; // sans facture
      if (reste > 0) nbEnRetard += 1;
      else nbAJour += 1;
    }
    const nbSansFacture = nbInscrits - nbAJour - nbEnRetard;

    const tauxRecouvrement = totalFacture > 0 ? (totalEncaisse / totalFacture) * 100 : 0;

    // Salaires : mois civil courant, et cumul sur toute l'année scolaire
    const maintenant = new Date();
    const moisCourant = maintenant.getMonth() + 1;
    const anneeCivileCourante = maintenant.getFullYear();
    const moisAnneeScolaire = this.moisDeAnnee(annee);

    // Tout bulletin de paie compte dès sa création, brouillon compris : le salaire est
    // pris directement, sans attendre la validation (voir aussi les autres tableaux de ce service).
    const [bulletinsMoisCourant, bulletinsAnneeScolaire] = await Promise.all([
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, annee: anneeCivileCourante, mois: moisCourant },
      }),
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, OR: moisAnneeScolaire.map((m) => ({ annee: m.annee, mois: m.mois })) },
      }),
    ]);
    const masseSalarialeMois = bulletinsMoisCourant.reduce((a, b) => a + Number(b.netAPayer), 0);
    const masseSalarialeCumul = bulletinsAnneeScolaire.reduce((a, b) => a + Number(b.netAPayer), 0);

    // Compte de résultat (trésorerie, année scolaire)
    const { debut, fin } = this.plageAnnee(annee);

    const paiementsAnnee = await this.prisma.paiement.findMany({
      where: { ecoleId, datePaiement: { gte: debut, lt: fin } },
      select: { montant: true, facture: { select: { type: true } } },
    });
    const ecolageEncaisseAnnee = paiementsAnnee
      .filter((p) => p.facture.type !== 'INSCRIPTION')
      .reduce((a, p) => a + Number(p.montant), 0);
    const inscriptionEncaisseeAnnee = paiementsAnnee
      .filter((p) => p.facture.type === 'INSCRIPTION')
      .reduce((a, p) => a + Number(p.montant), 0);

    const mouvements = await this.prisma.mouvementFinancier.findMany({
      where: { ecoleId, date: { gte: debut, lt: fin } },
      select: { type: true, montant: true },
    });
    const autresRecettes = mouvements
      .filter((m) => m.type === 'RECETTE')
      .reduce((a, m) => a + Number(m.montant), 0);
    const depensesAutres = mouvements
      .filter((m) => m.type === 'DEPENSE')
      .reduce((a, m) => a + Number(m.montant), 0);

    const recettesTotales = ecolageEncaisseAnnee + inscriptionEncaisseeAnnee + autresRecettes;
    const depensesTotales = masseSalarialeCumul + depensesAutres;
    const resultatNet = recettesTotales - depensesTotales;

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      moisCourant: MOIS_LABELS[moisCourant - 1],
      ecolage: {
        totalFacture,
        totalEncaisse,
        totalRestant,
        tauxRecouvrement: Math.round(tauxRecouvrement * 10) / 10,
      },
      inscription: {
        totalFacture: totalFactureInscription,
        totalEncaisse: totalEncaisseInscription,
        totalRestant: totalRestantInscription,
        tauxRecouvrement: Math.round(tauxRecouvrementInscription * 10) / 10,
      },
      eleves: {
        nbInscrits,
        nbAJour,
        nbEnRetard,
        nbSansFacture,
      },
      salaires: {
        masseSalarialeMois,
        masseSalarialeCumul,
      },
      compteResultat: {
        ecolageEncaisse: ecolageEncaisseAnnee,
        inscriptionEncaisse: inscriptionEncaisseeAnnee,
        autresRecettes,
        recettesTotales,
        depensesSalaires: masseSalarialeCumul,
        depensesAutres,
        depensesTotales,
        resultatNet,
      },
      // Conservé pour compatibilité : trésorerie encaissé écolage - salaires
      soldeNet: totalEncaisse - masseSalarialeCumul,
    };
  }

  // ── Mouvements financiers (recettes/dépenses hors écolage & salaires) ──

  async creerMouvement(
    ecoleId: string,
    dto: { type: 'RECETTE' | 'DEPENSE'; categorie: string; libelle: string; montant: number; date?: string; modePaiement?: string },
    saisieParId: string,
  ) {
    // Les salaires viennent des bulletins de paie : les saisir aussi ici les compterait deux fois.
    if (dto.type === 'DEPENSE' && dto.categorie.trim().toLowerCase() === 'salaires') {
      throw new BadRequestException('Les salaires se saisissent dans Paie, pas comme une dépense');
    }
    return this.prisma.mouvementFinancier.create({
      data: {
        ecoleId,
        type: dto.type,
        categorie: dto.categorie,
        libelle: dto.libelle,
        montant: dto.montant,
        date: dto.date ? new Date(dto.date) : new Date(),
        modePaiement: dto.modePaiement,
        saisieParId,
      },
    });
  }

  async listMouvements(ecoleId: string, anneeScolaireId?: string, type?: 'RECETTE' | 'DEPENSE') {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const { debut, fin } = this.plageAnnee(annee);
    const where: any = { ecoleId, date: { gte: debut, lt: fin } };
    if (type) where.type = type;
    return this.prisma.mouvementFinancier.findMany({ where, orderBy: { date: 'desc' } });
  }

  async supprimerMouvement(ecoleId: string, id: string, code?: string) {
    const m = await this.prisma.mouvementFinancier.findFirst({ where: { id, ecoleId } });
    if (!m) throw new BadRequestException('Mouvement introuvable');
    // 403 et non 401 : le client déconnecte l'utilisateur sur un 401, ce qui n'a pas de sens pour un mauvais code.
    if (m.type === 'DEPENSE' && !codeSuppressionValide(code)) {
      throw new ForbiddenException(
        code ? 'Code de suppression incorrect' : 'Le code de suppression est requis pour supprimer une dépense',
      );
    }
    return this.prisma.mouvementFinancier.delete({ where: { id } });
  }

  // Compte de résultat mensuel (année scolaire) : recettes vs dépenses.
  async compteResultatParMois(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const { debut, fin } = this.plageAnnee(annee);
    const moisListe = this.moisDeAnnee(annee);

    const [paiements, bulletins, mouvements] = await Promise.all([
      this.prisma.paiement.findMany({ where: { ecoleId, datePaiement: { gte: debut, lt: fin } }, select: { montant: true, datePaiement: true } }),
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, OR: moisListe.map((m) => ({ annee: m.annee, mois: m.mois })) },
        select: { mois: true, annee: true, netAPayer: true },
      }),
      this.prisma.mouvementFinancier.findMany({ where: { ecoleId, date: { gte: debut, lt: fin } }, select: { type: true, montant: true, date: true } }),
    ]);

    const parMois = moisListe.map((m) => ({ ...m, recettes: 0, depenses: 0, resultat: 0 }));
    const index = new Map(parMois.map((l, i) => [`${l.annee}-${l.mois}`, i]));

    for (const p of paiements) {
      const i = index.get(`${p.datePaiement.getFullYear()}-${p.datePaiement.getMonth() + 1}`);
      if (i !== undefined) parMois[i].recettes += Number(p.montant);
    }
    for (const b of bulletins) {
      const i = index.get(`${b.annee}-${b.mois}`);
      if (i !== undefined) parMois[i].depenses += Number(b.netAPayer);
    }
    for (const m of mouvements) {
      const i = index.get(`${m.date.getFullYear()}-${m.date.getMonth() + 1}`);
      if (i === undefined) continue;
      if (m.type === 'RECETTE') parMois[i].recettes += Number(m.montant);
      else parMois[i].depenses += Number(m.montant);
    }
    for (const l of parMois) l.resultat = l.recettes - l.depenses;

    const totalRecettes = parMois.reduce((a, l) => a + l.recettes, 0);
    const totalDepenses = parMois.reduce((a, l) => a + l.depenses, 0);
    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      totalRecettes,
      totalDepenses,
      resultatNet: totalRecettes - totalDepenses,
      parMois,
    };
  }

  // Tableau de trésorerie mensuel de l'année scolaire (même logique que le budget
  // de trésorerie papier de l'école, mais calculé sur les opérations réelles) :
  //   - colonnes : octobre à juin, comme le budget papier ; les opérations datées avant
  //     octobre (inscriptions de la rentrée...) ou après juin vont dans une colonne
  //     « Avant octobre » / « Après juin », affichée seulement si elle n'est pas vide,
  //     pour que les totaux restent ceux de l'année entière
  //   - encaissements : paiements des élèves, ventilés par niveau, + autres recettes
  //   - décaissements : salaires (bulletins validés) + dépenses, par catégorie
  //   - flux FT = E − D ; trésorerie initiale Ti = trésorerie finale de la colonne précédente
  //     (0 pour la première) ; trésorerie finale Tf = FT + Ti ; bénéfice = Σ FT.
  async tresorerieParMois(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const { debut, fin } = this.plageAnnee(annee);
    const moisAnnee = this.moisDeAnnee(annee);
    const moisDeLAnnee = new Set(moisAnnee.map((m) => `${m.annee}-${m.mois}`));

    // Octobre de l'année de rentrée : une année qui démarre de juillet à décembre
    // est celle de ce même octobre, une année qui démarre de janvier à juin celle de l'octobre précédent.
    const anneeOctobre = annee.dateDebut.getMonth() >= 6 ? annee.dateDebut.getFullYear() : annee.dateDebut.getFullYear() - 1;
    type Colonne = { annee: number; mois: number; libelle: string; hors?: 'AVANT' | 'APRES' };
    const colonnes: Colonne[] = [
      { annee: 0, mois: 0, libelle: 'Avant octobre', hors: 'AVANT' },
      ...Array.from({ length: 9 }, (_, k) => ({
        annee: anneeOctobre + Math.floor((9 + k) / 12),
        mois: ((9 + k) % 12) + 1,
        libelle: MOIS_LABELS[(9 + k) % 12],
      })),
      { annee: 0, mois: 0, libelle: 'Après juin', hors: 'APRES' },
    ];
    const rangOctobre = anneeOctobre * 12 + 9;
    const colonneDe = (a: number, m: number) => {
      const decalage = a * 12 + (m - 1) - rangOctobre;
      return decalage < 0 ? 0 : decalage > 8 ? colonnes.length - 1 : decalage + 1;
    };
    const dansAnnee = (d: Date) => d >= debut && d < fin;

    const [paiements, bulletins, mouvements] = await Promise.all([
      this.prisma.paiement.findMany({
        where: { ecoleId, datePaiement: { gte: debut, lt: fin } },
        select: { montant: true, datePaiement: true, facture: { select: { eleveId: true, anneeScolaireId: true } } },
      }),
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, OR: moisAnnee.map((m) => ({ annee: m.annee, mois: m.mois })) },
        select: { mois: true, annee: true, netAPayer: true },
      }),
      this.prisma.mouvementFinancier.findMany({
        where: { ecoleId, date: { gte: debut, lt: fin } },
        select: { type: true, categorie: true, montant: true, date: true },
      }),
    ]);

    // Niveau de chaque élève payeur : celui de l'inscription de l'année de la
    // facture, à défaut celui de l'année courante, à défaut « Sans niveau ».
    const eleveIds = [...new Set(paiements.map((p) => p.facture.eleveId))];
    const inscriptions = eleveIds.length
      ? await this.prisma.inscription.findMany({
          where: { ecoleId, eleveId: { in: eleveIds } },
          select: {
            eleveId: true,
            anneeScolaireId: true,
            classe: { select: { niveau: { select: { nom: true, ordre: true } } } },
          },
        })
      : [];
    const niveauParEleveEtAnnee = new Map<string, { nom: string; ordre: number }>();
    const niveauParEleve = new Map<string, { nom: string; ordre: number }>();
    for (const i of inscriptions) {
      niveauParEleveEtAnnee.set(`${i.eleveId}|${i.anneeScolaireId}`, i.classe.niveau);
      if (i.anneeScolaireId === annee.id || !niveauParEleve.has(i.eleveId)) niveauParEleve.set(i.eleveId, i.classe.niveau);
    }

    type Ligne = { libelle: string; origine: 'ELEVES' | 'MOUVEMENT' | 'SALAIRES'; ordre: number; parMois: number[] };
    const cumuler = (lignes: Map<string, Ligne>, cle: string, base: Omit<Ligne, 'parMois'>, i: number, montant: number) => {
      const ligne = lignes.get(cle) ?? { ...base, parMois: colonnes.map(() => 0) };
      ligne.parMois[i] += montant;
      lignes.set(cle, ligne);
    };

    const encaissements = new Map<string, Ligne>();
    for (const p of paiements) {
      if (!dansAnnee(p.datePaiement)) continue;
      const i = colonneDe(p.datePaiement.getFullYear(), p.datePaiement.getMonth() + 1);
      const niveau =
        niveauParEleveEtAnnee.get(`${p.facture.eleveId}|${p.facture.anneeScolaireId}`) ?? niveauParEleve.get(p.facture.eleveId);
      cumuler(
        encaissements,
        `N:${niveau?.nom ?? ''}`,
        { libelle: niveau?.nom ?? 'Sans niveau', origine: 'ELEVES', ordre: niveau?.ordre ?? 9999 },
        i,
        Number(p.montant),
      );
    }

    const decaissements = new Map<string, Ligne>();
    // Le poste « Salaires » est toujours présent, même à zéro, comme sur le budget papier.
    cumuler(decaissements, 'SALAIRES', { libelle: 'Salaires', origine: 'SALAIRES', ordre: 0 }, 0, 0);
    for (const b of bulletins) {
      if (!moisDeLAnnee.has(`${b.annee}-${b.mois}`)) continue;
      cumuler(decaissements, 'SALAIRES', { libelle: 'Salaires', origine: 'SALAIRES', ordre: 0 }, colonneDe(b.annee, b.mois), Number(b.netAPayer));
    }

    for (const m of mouvements) {
      if (!dansAnnee(m.date)) continue;
      const i = colonneDe(m.date.getFullYear(), m.date.getMonth() + 1);
      const cible = m.type === 'RECETTE' ? encaissements : decaissements;
      cumuler(cible, `M:${m.categorie}`, { libelle: m.categorie, origine: 'MOUVEMENT', ordre: 10000 }, i, Number(m.montant));
    }

    const finaliser = (lignes: Map<string, Ligne>) => {
      const liste = Array.from(lignes.values())
        .sort((a, b) => a.ordre - b.ordre || a.libelle.localeCompare(b.libelle))
        .map((l) => ({
          libelle: l.libelle,
          origine: l.origine,
          parMois: l.parMois,
          total: l.parMois.reduce((a, v) => a + v, 0),
        }));
      const parMois = colonnes.map((_, i) => liste.reduce((a, l) => a + l.parMois[i], 0));
      return { lignes: liste, parMois, total: parMois.reduce((a, v) => a + v, 0) };
    };

    const encComplet = finaliser(encaissements);
    const decComplet = finaliser(decaissements);

    // Les colonnes « Avant octobre » / « Après juin » ne sont gardées que si elles contiennent
    // des opérations ; les autres colonnes (octobre à juin) sont toujours affichées.
    const garder = colonnes.map((c, i) => !c.hors || encComplet.parMois[i] !== 0 || decComplet.parMois[i] !== 0);
    const filtrer = (v: number[]) => v.filter((_, i) => garder[i]);
    const reduire = (b: typeof encComplet) => ({
      lignes: b.lignes.map((l) => ({ ...l, parMois: filtrer(l.parMois) })),
      parMois: filtrer(b.parMois),
      total: b.total,
    });
    const enc = reduire(encComplet);
    const dec = reduire(decComplet);
    const moisListe = colonnes.filter((_, i) => garder[i]);

    const flux = moisListe.map((_, i) => enc.parMois[i] - dec.parMois[i]);
    const tresorerieInitiale: number[] = [];
    const tresorerieFinale: number[] = [];
    let precedente = 0;
    flux.forEach((ft, i) => {
      tresorerieInitiale[i] = precedente;
      tresorerieFinale[i] = precedente + ft;
      precedente = tresorerieFinale[i];
    });

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      // Bornes de l'année : une opération datée en dehors n'apparaît dans aucun tableau.
      periode: { debut: annee.dateDebut.toISOString().slice(0, 10), fin: annee.dateFin.toISOString().slice(0, 10) },
      mois: moisListe,
      encaissements: enc,
      decaissements: dec,
      flux,
      tresorerieInitiale,
      tresorerieFinale,
      benefice: enc.total - dec.total,
    };
  }

  // Recettes encaissées par mois (année scolaire), basées sur les paiements.
  async recettesParMois(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const { debut, fin } = this.plageAnnee(annee);
    const moisListe = this.moisDeAnnee(annee);
    const paiements = await this.prisma.paiement.findMany({
      where: { ecoleId, datePaiement: { gte: debut, lt: fin } },
      select: { montant: true, datePaiement: true },
    });

    const parMois = moisListe.map((m) => ({ ...m, montant: 0 }));
    const index = new Map(parMois.map((l, i) => [`${l.annee}-${l.mois}`, i]));
    let total = 0;
    for (const p of paiements) {
      const i = index.get(`${p.datePaiement.getFullYear()}-${p.datePaiement.getMonth() + 1}`);
      if (i === undefined) continue;
      parMois[i].montant += Number(p.montant);
      total += Number(p.montant);
    }
    return { anneeScolaire: { id: annee.id, libelle: annee.libelle }, total, parMois };
  }

  // Masse salariale par mois + cumul (année scolaire). Brouillons compris (voir dashboard()).
  async salairesParMois(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const moisListe = this.moisDeAnnee(annee);
    const bulletins = await this.prisma.bulletinPaie.findMany({
      where: { ecoleId, OR: moisListe.map((m) => ({ annee: m.annee, mois: m.mois })) },
    });

    const parMois = moisListe.map((m) => ({ ...m, montant: 0, cumul: 0 }));
    const index = new Map(parMois.map((l, i) => [`${l.annee}-${l.mois}`, i]));
    for (const b of bulletins) {
      const i = index.get(`${b.annee}-${b.mois}`);
      if (i !== undefined) parMois[i].montant += Number(b.netAPayer);
    }
    let cumul = 0;
    for (const ligne of parMois) {
      cumul += ligne.montant;
      ligne.cumul = cumul;
    }
    return { anneeScolaire: { id: annee.id, libelle: annee.libelle }, total: cumul, parMois };
  }

  // Recouvrement de l'écolage par classe.
  async recouvrementParClasse(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS' },
      include: { classe: { include: { niveau: true } } },
    });
    const classeParEleve = new Map<string, { id: string; nom: string; niveau: string }>();
    for (const i of inscriptions) {
      classeParEleve.set(i.eleveId, { id: i.classeId, nom: i.classe.nom, niveau: i.classe.niveau.nom });
    }

    const factures = await this.prisma.facture.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: { not: 'ANNULEE' } },
    });

    const parClasse = new Map<
      string,
      { classeId: string; classe: string; niveau: string; nbEleves: Set<string>; totalFacture: number; totalPaye: number }
    >();

    for (const f of factures) {
      const classe = classeParEleve.get(f.eleveId);
      if (!classe) continue; // élève sans inscription courante
      const entry =
        parClasse.get(classe.id) ??
        { classeId: classe.id, classe: classe.nom, niveau: classe.niveau, nbEleves: new Set<string>(), totalFacture: 0, totalPaye: 0 };
      entry.nbEleves.add(f.eleveId);
      entry.totalFacture += Number(f.montantTotal);
      entry.totalPaye += Number(f.montantPaye);
      parClasse.set(classe.id, entry);
    }

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      classes: Array.from(parClasse.values())
        .map((c) => ({
          classeId: c.classeId,
          classe: c.classe,
          niveau: c.niveau,
          nbEleves: c.nbEleves.size,
          totalFacture: c.totalFacture,
          totalPaye: c.totalPaye,
          totalRestant: c.totalFacture - c.totalPaye,
          taux: c.totalFacture > 0 ? Math.round((c.totalPaye / c.totalFacture) * 1000) / 10 : 0,
        }))
        .sort((a, b) => a.classe.localeCompare(b.classe)),
    };
  }

  // Statistiques de paiement des élèves inscrits, garçons / filles / total, avec filtres
  // niveau et classe (année scolaire courante par défaut). Un élève est « payé » quand il a
  // des factures et que tout est soldé, « non payé » quand il lui reste quelque chose à
  // payer (dont « partiels » : déjà un versement), « sans facture » sinon.
  async statistiquesPaiements(
    ecoleId: string,
    filtres: { anneeScolaireId?: string; niveauId?: string; classeId?: string } = {},
  ) {
    const annee = await this.resoudreAnnee(ecoleId, filtres.anneeScolaireId);

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
      if (!classe) throw new BadRequestException("Classe invalide pour cette année scolaire");
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
      select: { eleveId: true, eleve: { select: { genre: true } } },
    });

    const factures = inscriptions.length
      ? await this.prisma.facture.findMany({
          where: {
            ecoleId,
            anneeScolaireId: annee.id,
            statut: { not: 'ANNULEE' },
            eleveId: { in: inscriptions.map((i) => i.eleveId) },
          },
          select: { eleveId: true, montantTotal: true, montantPaye: true },
        })
      : [];
    const parEleve = new Map<string, { facture: number; paye: number }>();
    for (const f of factures) {
      const e = parEleve.get(f.eleveId) ?? { facture: 0, paye: 0 };
      e.facture += Number(f.montantTotal);
      e.paye += Number(f.montantPaye);
      parEleve.set(f.eleveId, e);
    }

    const vide = () => ({ effectif: 0, payes: 0, nonPayes: 0, dontPartiels: 0, sansFacture: 0, totalFacture: 0, totalPaye: 0, totalRestant: 0, taux: 0 });
    const garcons = vide();
    const filles = vide();
    for (const i of inscriptions) {
      const ligne = i.eleve.genre === 'F' ? filles : garcons;
      const montants = parEleve.get(i.eleveId);
      ligne.effectif += 1;
      if (!montants) {
        ligne.sansFacture += 1;
        continue;
      }
      const reste = montants.facture - montants.paye;
      ligne.totalFacture += montants.facture;
      ligne.totalPaye += montants.paye;
      if (reste > 0) {
        ligne.nonPayes += 1;
        ligne.totalRestant += reste;
        if (montants.paye > 0) ligne.dontPartiels += 1;
      } else {
        ligne.payes += 1;
      }
    }

    const total = vide();
    for (const cle of Object.keys(total) as (keyof typeof total)[]) total[cle] = garcons[cle] + filles[cle];
    for (const ligne of [garcons, filles, total]) {
      ligne.taux = ligne.totalFacture > 0 ? Math.round((ligne.totalPaye / ligne.totalFacture) * 1000) / 10 : 0;
    }

    return {
      anneeScolaire: { id: annee.id, libelle: annee.libelle },
      filtres: {
        niveaux: Array.from(niveaux.values()),
        classes: classes.map((c) => ({ id: c.id, nom: c.nom, niveauId: c.niveauId })),
      },
      garcons,
      filles,
      total,
    };
  }

  // Bordereau journalier : tout ce qui a été encaissé un jour donné, une ligne par reçu (paiement),
  // avec filtre par niveau. Chaque ligne porte le N° de reçu (celui du paiement, imprimé sur le reçu),
  // le N° de la facture réglée et le type d'opération, déduit de la facture : inscription,
  // réinscription, écolage ou trimestre 1, 2, 3 (voir type-operation.util.ts).
  async bordereauJournalier(ecoleId: string, filtres: { date?: string; niveauId?: string } = {}) {
    const date = filtres.date ?? new Date().toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(`${date}T00:00:00Z`))) {
      throw new BadRequestException('Date invalide : le format attendu est AAAA-MM-JJ');
    }
    const debut = new Date(`${date}T00:00:00.000Z`);
    const fin = new Date(debut.getTime() + 24 * 60 * 60 * 1000);

    const niveaux = await this.prisma.niveau.findMany({
      where: { ecoleId },
      orderBy: { ordre: 'asc' },
      select: { id: true, nom: true },
    });
    if (filtres.niveauId && !niveaux.some((n) => n.id === filtres.niveauId)) {
      throw new BadRequestException('Niveau invalide');
    }

    const [ecole, paiements] = await Promise.all([
      this.prisma.ecole.findUniqueOrThrow({ where: { id: ecoleId }, select: { nom: true, ville: true } }),
      this.prisma.paiement.findMany({
        where: { ecoleId, datePaiement: { gte: debut, lt: fin } },
        orderBy: { datePaiement: 'asc' },
        select: {
          id: true,
          montant: true,
          mode: true,
          facture: {
            select: {
              id: true,
              libelle: true,
              type: true,
              anneeScolaireId: true,
              eleve: { select: { id: true, nom: true, prenom: true, matricule: true } },
            },
          },
        },
      }),
    ]);

    // Classe et niveau de chaque élève : l'inscription de l'année de la facture, à défaut une autre.
    const eleveIds = [...new Set(paiements.map((p) => p.facture.eleve.id))];
    const inscriptions = eleveIds.length
      ? await this.prisma.inscription.findMany({
          where: { ecoleId, eleveId: { in: eleveIds } },
          select: {
            eleveId: true,
            anneeScolaireId: true,
            classe: { select: { nom: true, niveauId: true, niveau: { select: { nom: true, ordre: true } } } },
          },
        })
      : [];
    type Classe = { nom: string; niveauId: string; niveau: { nom: string; ordre: number } };
    const classeParEleveEtAnnee = new Map<string, Classe>();
    const classeParEleve = new Map<string, Classe>();
    for (const i of inscriptions) {
      classeParEleveEtAnnee.set(`${i.eleveId}|${i.anneeScolaireId}`, i.classe);
      if (!classeParEleve.has(i.eleveId)) classeParEleve.set(i.eleveId, i.classe);
    }

    const LIBELLES_MODE: Record<string, string> = {
      ESPECES: 'Espèces',
      VIREMENT: 'Virement',
      CHEQUE: 'Chèque',
      MOBILE_MONEY: 'Mobile money',
      AUTRE: 'Autre',
    };
    const brutes: (Ligne & { ordre: number })[] = [];
    for (const p of paiements) {
      const { facture } = p;
      const classe = classeParEleveEtAnnee.get(`${facture.eleve.id}|${facture.anneeScolaireId}`) ?? classeParEleve.get(facture.eleve.id);
      if (filtres.niveauId && classe?.niveauId !== filtres.niveauId) continue;

      const type = typeOperation(facture);
      const montant = Number(p.montant);
      brutes.push({
        numeroRecu: p.id,
        numeroFacture: facture.id,
        eleveId: facture.eleve.id,
        matricule: facture.eleve.matricule,
        nomComplet: `${facture.eleve.prenom} ${facture.eleve.nom}`,
        classe: classe?.nom ?? '',
        niveau: classe?.niveau.nom ?? '',
        ordre: classe?.niveau.ordre ?? Number.MAX_SAFE_INTEGER,
        typeOperation: type,
        fraisEtudes: estFraisEtudes(type) ? montant : 0,
        totalPaye: montant,
        date,
        observation: LIBELLES_MODE[p.mode] ?? p.mode,
      });
    }

    // Par niveau puis par classe, comme la feuille papier ; à classe égale, dans l'ordre d'encaissement
    // (le tri est stable et les paiements arrivent classés par heure).
    const lignes: Ligne[] = brutes
      .sort((a, b) => a.ordre - b.ordre || a.classe.localeCompare(b.classe))
      .map(({ ordre: _ordre, ...ligne }) => ligne);

    return {
      date,
      ecole: { nom: ecole.nom, ville: ecole.ville },
      filtres: { niveaux },
      lignes,
      totaux: {
        fraisEtudes: lignes.reduce((a, l) => a + l.fraisEtudes, 0),
        totalPaye: lignes.reduce((a, l) => a + l.totalPaye, 0),
      },
    };
  }

  // Élèves inscrits, filtrés par statut de paiement.
  async eleves(ecoleId: string, filtre: 'TOUS' | 'A_JOUR' | 'EN_RETARD', anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);

    const inscriptions = await this.prisma.inscription.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: 'EN_COURS' },
      include: { eleve: true, classe: true },
      orderBy: { eleve: { nom: 'asc' } },
    });

    const factures = await this.prisma.facture.findMany({
      where: { ecoleId, anneeScolaireId: annee.id, statut: { not: 'ANNULEE' } },
    });
    const parEleve = new Map<string, { total: number; paye: number }>();
    for (const f of factures) {
      const e = parEleve.get(f.eleveId) ?? { total: 0, paye: 0 };
      e.total += Number(f.montantTotal);
      e.paye += Number(f.montantPaye);
      parEleve.set(f.eleveId, e);
    }

    const lignes = inscriptions.map((i) => {
      const agg = parEleve.get(i.eleveId) ?? { total: 0, paye: 0 };
      const reste = agg.total - agg.paye;
      return {
        eleveId: i.eleveId,
        nom: i.eleve.nom,
        prenom: i.eleve.prenom,
        matricule: i.eleve.matricule,
        classe: i.classe.nom,
        totalFacture: agg.total,
        totalPaye: agg.paye,
        reste,
        aJour: reste <= 0,
      };
    });

    const filtrees =
      filtre === 'A_JOUR'
        ? lignes.filter((l) => l.totalFacture > 0 && l.aJour)
        : filtre === 'EN_RETARD'
          ? lignes.filter((l) => l.reste > 0)
          : lignes;

    return { anneeScolaire: { id: annee.id, libelle: annee.libelle }, eleves: filtrees };
  }
}
