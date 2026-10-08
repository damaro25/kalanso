import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SaisirNotesDto } from '../notes/dto/note.dto';
import { CreateMatiereDto } from '../notes/dto/matiere.dto';
import { CreateAppelDto } from '../absences/dto/appel.dto';
import { CreateCreneauDto } from '../emploi-du-temps/dto/creneau.dto';
import { CreatePaiementDto } from '../finances/dto/paiement.dto';
import { CreateFactureDto } from '../finances/dto/facture.dto';
import { CreateTarifEcolageDto } from '../finances/dto/tarif-ecolage.dto';
import { CreateUtilisateurDto } from '../ecoles/dto/utilisateur.dto';
import { InitierTransactionDto } from '../mobile-money/dto/initier-transaction.dto';
import { LoginDto } from '../auth/dto/login.dto';
import { CreateMouvementDto } from '../finance/dto/mouvement.dto';
import { CreateEmpruntDto } from '../bibliotheque/dto/emprunt.dto';
import { CreateDemandeDto, InscriptionDirecteDto } from '../admissions/dto/demande.dto';
import { CreateBulletinPaieDto } from '../paie/dto/bulletin-paie.dto';

// Même configuration que le ValidationPipe global de main.ts.
async function erreurs(cls: new () => object, plain: object): Promise<string[]> {
  const instance = plainToInstance(cls, plain);
  const res = await validate(instance, { whitelist: true });
  const champs: string[] = [];
  const parcourir = (errs: typeof res, prefixe = '') => {
    for (const e of errs) {
      if (e.constraints) champs.push(prefixe + e.property);
      if (e.children?.length) parcourir(e.children, `${prefixe}${e.property}.`);
    }
  };
  parcourir(res);
  return champs;
}

describe('validation des DTO', () => {
  describe('SaisirNotesDto', () => {
    const base = { classeId: 'c1', trimestre: 1, entries: [{ eleveId: 'e1', matiereId: 'm1', valeur: 7.5 }] };

    it('accepte une saisie valide', async () => {
      expect(await erreurs(SaisirNotesDto, base)).toEqual([]);
    });

    it.each([0, 4, 1.5, '2'])('refuse le trimestre %p', async (trimestre) => {
      expect(await erreurs(SaisirNotesDto, { ...base, trimestre })).toContain('trimestre');
    });

    it.each([-0.5, 10.01, 'abc'])('refuse la note %p (échelle 0 à 10)', async (valeur) => {
      const e = await erreurs(SaisirNotesDto, { ...base, entries: [{ eleveId: 'e1', matiereId: 'm1', valeur }] });
      expect(e).toContain('entries.0.valeur');
    });

    it.each([0, 10])('accepte les bornes de la note : %p', async (valeur) => {
      expect(await erreurs(SaisirNotesDto, { ...base, entries: [{ eleveId: 'e1', matiereId: 'm1', valeur }] })).toEqual([]);
    });

    it('refuse une liste vide', async () => {
      expect(await erreurs(SaisirNotesDto, { ...base, entries: [] })).toContain('entries');
    });
  });

  describe('CreateAppelDto', () => {
    const base = { classeId: 'c1', date: '2026-10-05', entries: [{ eleveId: 'e1', statut: 'ABSENT' }] };

    it('accepte un appel valide', async () => {
      expect(await erreurs(CreateAppelDto, base)).toEqual([]);
    });

    it('refuse un statut inconnu, une date invalide et un appel vide', async () => {
      expect(await erreurs(CreateAppelDto, { ...base, entries: [{ eleveId: 'e1', statut: 'MALADE' }] })).toContain('entries.0.statut');
      expect(await erreurs(CreateAppelDto, { ...base, date: 'hier' })).toContain('date');
      expect(await erreurs(CreateAppelDto, { ...base, entries: [] })).toContain('entries');
    });
  });

  describe('CreateCreneauDto', () => {
    const base = { classeId: 'c', matiereId: 'm', jour: 'LUNDI', heureDebut: '08:00', heureFin: '09:30' };

    it('accepte un créneau valide', async () => {
      expect(await erreurs(CreateCreneauDto, base)).toEqual([]);
    });

    it.each(['8:00', '24:00', '08:60', '0800', 'matin'])('refuse l\'heure %p', async (h) => {
      expect(await erreurs(CreateCreneauDto, { ...base, heureDebut: h })).toContain('heureDebut');
      expect(await erreurs(CreateCreneauDto, { ...base, heureFin: h })).toContain('heureFin');
    });

    it('refuse un jour inconnu et un taux horaire négatif', async () => {
      expect(await erreurs(CreateCreneauDto, { ...base, jour: 'DIMANCHE_SOIR' })).toContain('jour');
      expect(await erreurs(CreateCreneauDto, { ...base, tauxHoraire: -1 })).toContain('tauxHoraire');
      expect(await erreurs(CreateCreneauDto, { ...base, tauxHoraire: 0 })).toEqual([]);
    });
  });

  describe('montants financiers strictement positifs', () => {
    it.each([0, -100, '1000'])('CreatePaiementDto refuse le montant %p', async (montant) => {
      expect(await erreurs(CreatePaiementDto, { factureId: 'f1', montant })).toContain('montant');
    });

    it('CreatePaiementDto accepte un montant positif, un mode connu, un id client optionnel', async () => {
      expect(await erreurs(CreatePaiementDto, { id: 'client-1', factureId: 'f1', montant: 1000, mode: 'ESPECES' })).toEqual([]);
      expect(await erreurs(CreatePaiementDto, { factureId: 'f1', montant: 1000, mode: 'TROC' })).toContain('mode');
    });

    it('CreateFactureDto : montant positif et échéance au format date', async () => {
      const base = { eleveId: 'e1', libelle: 'Cantine', montantTotal: 15000 };
      expect(await erreurs(CreateFactureDto, base)).toEqual([]);
      expect(await erreurs(CreateFactureDto, { ...base, montantTotal: 0 })).toContain('montantTotal');
      expect(await erreurs(CreateFactureDto, { ...base, dateEcheance: 'bientôt' })).toContain('dateEcheance');
    });

    it('CreateTarifEcolageDto refuse un montant nul', async () => {
      expect(await erreurs(CreateTarifEcolageDto, { niveauId: 'n', anneeScolaireId: 'a', libelle: 'T1', montant: 0 })).toContain('montant');
    });

    it('CreateMouvementDto refuse un montant nul ou négatif (cohérent avec le formulaire)', async () => {
      const base = { type: 'RECETTE', categorie: 'Dons', libelle: 'Don', montant: 5000 };
      expect(await erreurs(CreateMouvementDto, base)).toEqual([]);
      expect(await erreurs(CreateMouvementDto, { ...base, montant: 0 })).toContain('montant');
      expect(await erreurs(CreateMouvementDto, { ...base, montant: -1 })).toContain('montant');
    });

    it('InitierTransactionDto : montant positif', async () => {
      const base = { factureId: 'f1', operateur: 'ORANGE_MONEY', telephone: '620000000', montant: 1000 };
      expect(await erreurs(InitierTransactionDto, base)).toEqual([]);
      expect(await erreurs(InitierTransactionDto, { ...base, montant: -5 })).toContain('montant');
    });
  });

  describe('InitierTransactionDto : téléphone et opérateur', () => {
    const base = { factureId: 'f1', operateur: 'ORANGE_MONEY', telephone: '620000000', montant: 1000 };

    it.each(['12345', '1234567890123456', '+224620000000', '62 00 00'])('refuse le numéro %p', async (telephone) => {
      expect(await erreurs(InitierTransactionDto, { ...base, telephone })).toContain('telephone');
    });

    it('refuse un opérateur inconnu', async () => {
      expect(await erreurs(InitierTransactionDto, { ...base, operateur: 'PIGEON' })).toContain('operateur');
    });
  });

  describe('dates en texte libre refusées (sinon Invalid Date puis erreur 500)', () => {
    it('CreateMouvementDto.date', async () => {
      const base = { type: 'DEPENSE', categorie: 'Divers', libelle: 'X', montant: 1 };
      expect(await erreurs(CreateMouvementDto, { ...base, date: '2026-10-05' })).toEqual([]);
      expect(await erreurs(CreateMouvementDto, { ...base, date: 'pas une date' })).toContain('date');
    });

    it('CreateEmpruntDto.dateRetourPrevue', async () => {
      const base = { livreId: 'l', eleveId: 'e' };
      expect(await erreurs(CreateEmpruntDto, { ...base, dateRetourPrevue: '2026-10-19' })).toEqual([]);
      expect(await erreurs(CreateEmpruntDto, { ...base, dateRetourPrevue: 'dans 2 semaines' })).toContain('dateRetourPrevue');
    });

    it('formulaires d\'admission (public et sur place) : dateNaissance', async () => {
      const parent = { nomParent: 'Diallo', prenomParent: 'Ibrahima', telephoneParent: '620000000' };
      const eleve = { nomEleve: 'Diallo', prenomEleve: 'Fatou', genre: 'F' };

      expect(await erreurs(CreateDemandeDto, { ecoleId: 'e', ...eleve, ...parent, dateNaissance: '2015-04-12' })).toEqual([]);
      expect(await erreurs(CreateDemandeDto, { ecoleId: 'e', ...eleve, ...parent, dateNaissance: 'abc' })).toContain('dateNaissance');
      expect(await erreurs(InscriptionDirecteDto, { ...eleve, ...parent, dateNaissance: '12/04/2015' })).toContain('dateNaissance');
      expect(await erreurs(InscriptionDirecteDto, { ...eleve, ...parent })).toEqual([]);
    });
  });

  describe('comptes et authentification', () => {
    it('LoginDto exige un email valide et 6 caractères minimum', async () => {
      expect(await erreurs(LoginDto, { email: 'a@b.gn', password: '123456' })).toEqual([]);
      expect(await erreurs(LoginDto, { email: 'pas-un-email', password: '123456' })).toContain('email');
      expect(await erreurs(LoginDto, { email: 'a@b.gn', password: '12345' })).toContain('password');
    });

    it('CreateUtilisateurDto : rôle connu et mot de passe de 6 caractères minimum', async () => {
      const base = { nom: 'A', prenom: 'B', email: 'a@b.gn', password: 'secret1', role: 'SECRETAIRE' };
      expect((await erreurs(CreateUtilisateurDto, { ...base, role: 'ROI' }))).toContain('role');
      expect((await erreurs(CreateUtilisateurDto, { ...base, password: 'abc' }))).toContain('password');
    });
  });

  describe('matières', () => {
    it('CreateMatiereDto : coefficient strictement positif', async () => {
      const base = { niveauId: 'n1', nom: 'Maths', coefficient: 2 };
      expect(await erreurs(CreateMatiereDto, base)).toEqual([]);
      expect(await erreurs(CreateMatiereDto, { ...base, coefficient: 0 })).toContain('coefficient');
    });
  });

  describe('CreateBulletinPaieDto', () => {
    const base = { personnelId: 'p1', mois: 9, annee: 2026 };

    it('accepte un bulletin minimal', async () => {
      expect(await erreurs(CreateBulletinPaieDto, base)).toEqual([]);
    });

    it.each([0, 13])('refuse le mois %p', async (mois) => {
      expect(await erreurs(CreateBulletinPaieDto, { ...base, mois })).toContain('mois');
    });

    it('refuse une retenue ou un gain négatif sur une ligne', async () => {
      const e = await erreurs(CreateBulletinPaieDto, { ...base, lignes: [{ libelle: 'Avance', montantRetenue: -5 }] });
      expect(e).toContain('lignes.0.montantRetenue');
    });

    it('refuse des heures négatives pour une classe', async () => {
      const e = await erreurs(CreateBulletinPaieDto, { ...base, heuresParClasse: [{ classeId: 'c', matiereId: 'm', heures: -1 }] });
      expect(e).toContain('heuresParClasse.0.heures');
    });
  });
});
