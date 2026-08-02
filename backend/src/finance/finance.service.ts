import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

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

    // Seuls les bulletins validés (non brouillon) comptent comme dépense réelle :
    // un brouillon reste modifiable/supprimable, ce n'est pas encore un engagement
    // financier confirmé (même logique que les factures vs paiements des élèves).
    const [bulletinsMoisCourant, bulletinsAnneeScolaire] = await Promise.all([
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, annee: anneeCivileCourante, mois: moisCourant, statut: { not: 'BROUILLON' } },
      }),
      this.prisma.bulletinPaie.findMany({
        where: { ecoleId, statut: { not: 'BROUILLON' }, OR: moisAnneeScolaire.map((m) => ({ annee: m.annee, mois: m.mois })) },
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

  creerMouvement(
    ecoleId: string,
    dto: { type: 'RECETTE' | 'DEPENSE'; categorie: string; libelle: string; montant: number; date?: string; modePaiement?: string },
    saisieParId: string,
  ) {
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

  async supprimerMouvement(ecoleId: string, id: string) {
    const m = await this.prisma.mouvementFinancier.findFirst({ where: { id, ecoleId } });
    if (!m) throw new BadRequestException('Mouvement introuvable');
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
        where: { ecoleId, statut: { not: 'BROUILLON' }, OR: moisListe.map((m) => ({ annee: m.annee, mois: m.mois })) },
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

  // Masse salariale par mois + cumul (année scolaire). Brouillons exclus (voir dashboard()).
  async salairesParMois(ecoleId: string, anneeScolaireId?: string) {
    const annee = await this.resoudreAnnee(ecoleId, anneeScolaireId);
    const moisListe = this.moisDeAnnee(annee);
    const bulletins = await this.prisma.bulletinPaie.findMany({
      where: { ecoleId, statut: { not: 'BROUILLON' }, OR: moisListe.map((m) => ({ annee: m.annee, mois: m.mois })) },
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
