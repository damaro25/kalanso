import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GrilleDto, UpdateEcoleDto } from './dto/configuration.dto';
import {
  GRILLE_REGIMES,
  NB_TRANCHES,
  libelleTranche,
  lireTranche,
  regimeTarif,
  type GrilleRegime,
  type Tranches,
} from './grille';
import {
  ANNEE_MAME_TA,
  ECHEANCES_MAME_TA,
  ECOLE_MAME_TA,
  FRAIS_INSCRIPTION_MAME_TA,
  FRAIS_REINSCRIPTION_MAME_TA,
  NIVEAUX_MAME_TA,
  tarifsMameTa,
} from './modele-mame-ta';
import { exigerAnneeOuverte } from '../common/annee-cloturee.util';

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Écran « Configuration » : coordonnées de l'école et grille tarifaire d'une année (frais d'inscription
// et tranches d'écolage par niveau et par régime) éditée en une fois. La grille ne fait que lire et écrire
// des TarifEcolage / FraisInscriptionNiveau ordinaires : la facturation n'en dépend pas.
@Injectable()
export class ConfigurationService {
  constructor(private prisma: PrismaService) {}

  ecole(ecoleId: string) {
    return this.prisma.ecole.findUniqueOrThrow({
      where: { id: ecoleId },
      select: {
        id: true,
        nom: true,
        sigle: true,
        ville: true,
        telephone: true,
        email: true,
        nomDirecteur: true,
        nomComptable: true,
        numeroRecuDepart: true,
        carteRetraitMinistere: true,
        carteRetraitDev: true,
        carteRetraitDce: true,
        carteRetraitSignataire: true,
      },
    });
  }

  async updateEcole(ecoleId: string, dto: UpdateEcoleDto) {
    // Champ vidé dans le formulaire : on efface la valeur plutôt que d'enregistrer une chaîne vide.
    const optionnel = (v: string | undefined) => (v === undefined ? undefined : v.trim() || null);
    await this.prisma.ecole.update({
      where: { id: ecoleId },
      data: {
        nom: dto.nom?.trim(),
        sigle: optionnel(dto.sigle),
        ville: optionnel(dto.ville),
        telephone: optionnel(dto.telephone),
        email: optionnel(dto.email),
        nomDirecteur: optionnel(dto.nomDirecteur),
        nomComptable: optionnel(dto.nomComptable),
        numeroRecuDepart: dto.numeroRecuDepart,
        carteRetraitMinistere: optionnel(dto.carteRetraitMinistere),
        carteRetraitDev: optionnel(dto.carteRetraitDev),
        carteRetraitDce: optionnel(dto.carteRetraitDce),
        carteRetraitSignataire: optionnel(dto.carteRetraitSignataire),
      },
    });
    return this.ecole(ecoleId);
  }

  private async verifierAnnee(ecoleId: string, anneeScolaireId: string) {
    const annee = await this.prisma.anneeScolaire.findFirst({ where: { id: anneeScolaireId, ecoleId } });
    if (!annee) throw new BadRequestException('Année scolaire invalide');
  }

  async grille(ecoleId: string, anneeScolaireId: string) {
    await this.verifierAnnee(ecoleId, anneeScolaireId);
    const [niveaux, tarifs, frais] = await Promise.all([
      this.prisma.niveau.findMany({ where: { ecoleId }, orderBy: [{ ordre: 'asc' }, { nom: 'asc' }] }),
      this.prisma.tarifEcolage.findMany({ where: { ecoleId, anneeScolaireId } }),
      this.prisma.fraisInscriptionNiveau.findMany({ where: { ecoleId, anneeScolaireId } }),
    ]);

    const echeances: (string | null)[] = Array(NB_TRANCHES).fill(null);
    const tarifsParNiveau = new Map<string, Partial<Record<GrilleRegime, Tranches>>>();
    for (const tarif of tarifs) {
      const tranche = lireTranche(tarif);
      if (!tranche) continue;
      const parRegime = tarifsParNiveau.get(tarif.niveauId) ?? {};
      const tranches = parRegime[tranche.regime] ?? [null, null, null];
      tranches[tranche.numero - 1] = Number(tarif.montant);
      parRegime[tranche.regime] = tranches;
      tarifsParNiveau.set(tarif.niveauId, parRegime);
      if (tarif.dateEcheance && !echeances[tranche.numero - 1]) {
        echeances[tranche.numero - 1] = tarif.dateEcheance.toISOString().slice(0, 10);
      }
    }
    const fraisParNiveau = new Map(frais.map((f) => [f.niveauId, f]));

    return {
      anneeScolaireId,
      echeances,
      niveaux: niveaux.map((n) => {
        const f = fraisParNiveau.get(n.id);
        return {
          niveauId: n.id,
          nom: n.nom,
          cycle: n.cycle,
          fraisInscription: f ? Number(f.montant) : null,
          fraisReinscription: f?.montantReinscription != null ? Number(f.montantReinscription) : null,
          tarifs: tarifsParNiveau.get(n.id) ?? {},
        };
      }),
    };
  }

  private verifierGrille(dto: GrilleDto) {
    for (const echeance of dto.echeances) {
      if (echeance !== null && (typeof echeance !== 'string' || !DATE_ISO.test(echeance) || isNaN(Date.parse(echeance)))) {
        throw new BadRequestException(`Échéance invalide : ${echeance}`);
      }
    }
    for (const niveau of dto.niveaux) {
      for (const [regime, tranches] of Object.entries(niveau.tarifs)) {
        if (!GRILLE_REGIMES.includes(regime as GrilleRegime)) {
          throw new BadRequestException(`Régime invalide : ${regime}`);
        }
        const valides =
          Array.isArray(tranches) &&
          tranches.length === NB_TRANCHES &&
          tranches.every((m) => m === null || (typeof m === 'number' && Number.isFinite(m) && m >= 0));
        if (!valides) throw new BadRequestException('Montants de tranches invalides');
      }
    }
  }

  // Enregistre toute la grille d'une année : crée ou met à jour chaque tranche renseignée, supprime celles
  // vidées (montant absent ou 0). Les factures déjà émises ne changent pas ; « Régénérer les factures
  // manquantes » facture ensuite les nouvelles tranches aux élèves déjà inscrits.
  async enregistrerGrille(ecoleId: string, anneeScolaireId: string, dto: GrilleDto) {
    await this.verifierAnnee(ecoleId, anneeScolaireId);
    await exigerAnneeOuverte(this.prisma, anneeScolaireId, 'modifier ses tarifs');
    this.verifierGrille(dto);

    const niveauxEcole = new Set(
      (await this.prisma.niveau.findMany({ where: { ecoleId }, select: { id: true } })).map((n) => n.id),
    );
    const inconnu = dto.niveaux.find((n) => !niveauxEcole.has(n.niveauId));
    if (inconnu) throw new BadRequestException('Niveau invalide');

    const existants = await this.prisma.tarifEcolage.findMany({ where: { ecoleId, anneeScolaireId } });
    const existantParCle = new Map(existants.map((t) => [`${t.niveauId}|${t.libelle}`, t]));
    const echeances = dto.echeances.map((e) => (e ? new Date(e) : null));

    await this.prisma.$transaction(
      async (tx) => {
        for (const niveau of dto.niveaux) {
          const cleFrais = { ecoleId_niveauId_anneeScolaireId: { ecoleId, niveauId: niveau.niveauId, anneeScolaireId } };
          if (niveau.fraisInscription) {
            const montants = { montant: niveau.fraisInscription, montantReinscription: niveau.fraisReinscription };
            await tx.fraisInscriptionNiveau.upsert({
              where: cleFrais,
              update: montants,
              create: { ecoleId, niveauId: niveau.niveauId, anneeScolaireId, ...montants },
            });
          } else {
            await tx.fraisInscriptionNiveau.deleteMany({ where: { ecoleId, niveauId: niveau.niveauId, anneeScolaireId } });
          }

          for (const regime of GRILLE_REGIMES) {
            for (let numero = 1; numero <= NB_TRANCHES; numero++) {
              const montant = niveau.tarifs[regime]?.[numero - 1] ?? null;
              const libelle = libelleTranche(regime, numero);
              const existant = existantParCle.get(`${niveau.niveauId}|${libelle}`);
              const donnees = { montant: montant ?? 0, regime: regimeTarif(regime), dateEcheance: echeances[numero - 1] };
              if (montant) {
                if (existant) {
                  await tx.tarifEcolage.update({ where: { id: existant.id }, data: donnees });
                } else {
                  await tx.tarifEcolage.create({
                    data: { ecoleId, niveauId: niveau.niveauId, anneeScolaireId, libelle, ...donnees },
                  });
                }
              } else if (existant) {
                await tx.tarifEcolage.delete({ where: { id: existant.id } });
              }
            }
          }
        }
      },
      { timeout: 60_000 },
    );

    return this.grille(ecoleId, anneeScolaireId);
  }

  // Bouton « Charger la fiche Mamé-TA 2025-2026 » : coordonnées, année, niveaux (une classe par niveau),
  // frais et grille tarifaire de la fiche. Relançable : rien n'est supprimé hors des tranches de la grille.
  async chargerModeleMameTa(ecoleId: string) {
    await this.prisma.ecole.update({ where: { id: ecoleId }, data: ECOLE_MAME_TA });

    const anneeCouranteExistante = await this.prisma.anneeScolaire.findFirst({ where: { ecoleId, courante: true } });
    const dates = { dateDebut: new Date(ANNEE_MAME_TA.dateDebut), dateFin: new Date(ANNEE_MAME_TA.dateFin) };
    const annee = await this.prisma.anneeScolaire.upsert({
      where: { ecoleId_libelle: { ecoleId, libelle: ANNEE_MAME_TA.libelle } },
      update: dates,
      // Courante seulement si l'école n'en a pas déjà une : on ne change pas l'année de travail en cours.
      create: { ecoleId, libelle: ANNEE_MAME_TA.libelle, ...dates, courante: !anneeCouranteExistante },
    });

    const tarifs = tarifsMameTa();
    const niveaux: GrilleDto['niveaux'] = [];
    for (const def of NIVEAUX_MAME_TA) {
      const niveau = await this.prisma.niveau.upsert({
        where: { ecoleId_nom: { ecoleId, nom: def.nom } },
        update: { cycle: def.cycle, ordre: def.ordre },
        create: { ecoleId, ...def },
      });
      await this.prisma.classe.upsert({
        where: { ecoleId_anneeScolaireId_nom: { ecoleId, anneeScolaireId: annee.id, nom: def.nom } },
        update: {},
        create: { ecoleId, niveauId: niveau.id, anneeScolaireId: annee.id, nom: def.nom },
      });
      niveaux.push({
        niveauId: niveau.id,
        fraisInscription: FRAIS_INSCRIPTION_MAME_TA,
        fraisReinscription: FRAIS_REINSCRIPTION_MAME_TA,
        tarifs: tarifs.get(def.nom) ?? {},
      });
    }

    return this.enregistrerGrille(ecoleId, annee.id, { echeances: [...ECHEANCES_MAME_TA], niveaux });
  }
}
