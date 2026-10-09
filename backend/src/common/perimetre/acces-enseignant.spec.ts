// Ce qu'un enseignant peut lire ou modifier : ses classes et leurs élèves, rien d'autre.
// Vérifie, contrôleur par contrôleur, que chaque route passe par le périmètre, et que les services filtrent bien.
import { ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { RoleUtilisateur } from '../../generated/prisma/enums';
import { createPrismaMock } from '../../../test/helpers/prisma-mock';
import { AbsencesController } from '../../absences/absences.controller';
import { AbsencesService } from '../../absences/absences.service';
import { ClassesController } from '../../ecoles/classes.controller';
import { ClassesService } from '../../ecoles/classes.service';
import { EmploiDuTempsController } from '../../emploi-du-temps/emploi-du-temps.controller';
import { ElevesController } from '../../eleves/eleves.controller';
import { ElevesService } from '../../eleves/eleves.service';
import { FraisInscriptionNiveauController } from '../../finances/frais-inscription-niveau.controller';
import { TarifsEcolageController } from '../../finances/tarifs-ecolage.controller';
import { LogistiqueController } from '../../logistique/logistique.controller';
import { NotesController } from '../../notes/notes.controller';
import { ReportingService } from '../../reporting/reporting.service';
import { PerimetreService } from './perimetre.service';

const enseignant = { userId: 'u1', ecoleId: 'ecole', role: 'ENSEIGNANT', email: 'e@x.gn', personnelId: 'p1' };
const direction = { userId: 'u2', ecoleId: 'ecole', role: 'FONDATEUR', email: 'f@x.gn', personnelId: null };

// Périmètre simulé : l'enseignant n'a que c1 et c2
function perimetre(restreint: boolean) {
  return {
    estRestreint: jest.fn().mockReturnValue(restreint),
    classesAutorisees: jest.fn().mockResolvedValue(restreint ? ['c1', 'c2'] : null),
    exigerClasse: jest.fn().mockResolvedValue(undefined),
    exigerEleve: jest.fn().mockResolvedValue(undefined),
  };
}
const refus = () => new ForbiddenException('hors périmètre');
const rolesDe = (cible: object, methode: string) => Reflect.getMetadata(ROLES_KEY, (cible as Record<string, object>)[methode]) as RoleUtilisateur[] | undefined;

describe("Accès de l'enseignant : routes", () => {
  describe('élèves', () => {
    let service: { findAll: jest.Mock; fiche: jest.Mock; ficheRestreinte: jest.Mock };
    let p: ReturnType<typeof perimetre>;
    let controleur: ElevesController;

    beforeEach(() => {
      service = { findAll: jest.fn().mockResolvedValue([]), fiche: jest.fn().mockResolvedValue({}), ficheRestreinte: jest.fn().mockResolvedValue({}) };
      p = perimetre(true);
      controleur = new ElevesController(service as never, p as never);
    });

    it('la liste est filtrée sur ses classes', async () => {
      await controleur.findAll(enseignant);
      expect(service.findAll).toHaveBeenCalledWith('ecole', ['c1', 'c2']);
    });

    it('la fiche exige que l\'élève soit dans ses classes, et renvoie la version restreinte', async () => {
      await controleur.fiche(enseignant, 'e1');
      expect(p.exigerEleve).toHaveBeenCalledWith(enseignant, 'e1');
      expect(service.ficheRestreinte).toHaveBeenCalledWith('ecole', 'e1');
      expect(service.fiche).not.toHaveBeenCalled();
    });

    it("la fiche d'un élève d'une autre classe est refusée avant toute lecture", async () => {
      p.exigerEleve.mockRejectedValue(refus());
      await expect(controleur.fiche(enseignant, 'e9')).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.ficheRestreinte).not.toHaveBeenCalled();
      expect(service.fiche).not.toHaveBeenCalled();
    });

    it('la direction garde la fiche complète et la liste entière', async () => {
      const libre = perimetre(false);
      const c = new ElevesController(service as never, libre as never);
      await c.findAll(direction);
      await c.fiche(direction, 'e1');
      expect(service.findAll).toHaveBeenCalledWith('ecole', null);
      expect(service.fiche).toHaveBeenCalledWith('ecole', 'e1');
      expect(service.ficheRestreinte).not.toHaveBeenCalled();
    });

    it("la liste complète des parents n'est pas accessible à l'enseignant", () => {
      expect(rolesDe(ElevesController.prototype, 'findAllParents')).not.toContain(RoleUtilisateur.ENSEIGNANT);
      expect(rolesDe(ElevesController.prototype, 'findAllParents')).toContain(RoleUtilisateur.SECRETAIRE);
    });
  });

  describe('classes', () => {
    let service: { findAll: jest.Mock; effectifs: jest.Mock; eleves: jest.Mock };
    let p: ReturnType<typeof perimetre>;
    let controleur: ClassesController;

    beforeEach(() => {
      service = { findAll: jest.fn().mockResolvedValue([]), effectifs: jest.fn().mockResolvedValue([]), eleves: jest.fn().mockResolvedValue([{ id: 'e1', nom: 'A', adresse: 'Rue 1' }]) };
      p = perimetre(true);
      controleur = new ClassesController(service as never, p as never);
    });

    it('la liste et les effectifs sont limités à ses classes', async () => {
      await controleur.findAll(enseignant, 'true');
      await controleur.effectifs(enseignant);
      expect(service.findAll).toHaveBeenCalledWith('ecole', { courante: true, classeIds: ['c1', 'c2'] });
      expect(service.effectifs).toHaveBeenCalledWith('ecole', ['c1', 'c2']);
    });

    it("les élèves d'une classe exigent la classe, et l'adresse est retirée", async () => {
      const eleves = await controleur.eleves(enseignant, 'c1');
      expect(p.exigerClasse).toHaveBeenCalledWith(enseignant, 'c1');
      expect(eleves).toEqual([{ id: 'e1', nom: 'A' }]);
    });

    it("les élèves d'une autre classe sont refusés", async () => {
      p.exigerClasse.mockRejectedValue(refus());
      await expect(controleur.eleves(enseignant, 'c9')).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.eleves).not.toHaveBeenCalled();
    });

    it("la direction reçoit l'adresse et aucune limite", async () => {
      const c = new ClassesController(service as never, perimetre(false) as never);
      expect(await c.eleves(direction, 'c9')).toEqual([{ id: 'e1', nom: 'A', adresse: 'Rue 1' }]);
      await c.findAll(direction);
      expect(service.findAll).toHaveBeenLastCalledWith('ecole', { courante: false, classeIds: null });
    });
  });

  describe('absences', () => {
    let service: Record<string, jest.Mock>;
    let p: ReturnType<typeof perimetre>;
    let controleur: AbsencesController;

    beforeEach(() => {
      service = {
        enregistrerAppel: jest.fn().mockResolvedValue([]),
        findByClasseAndDate: jest.fn().mockResolvedValue([]),
        findByEleve: jest.fn().mockResolvedValue([]),
        stats: jest.fn().mockResolvedValue([]),
      };
      p = perimetre(true);
      controleur = new AbsencesController(service as never, p as never);
    });

    it("l'appel n'est possible que pour une de ses classes", async () => {
      p.exigerClasse.mockRejectedValue(refus());
      await expect(controleur.enregistrerAppel(enseignant, { classeId: 'c9', date: '2026-10-09', entries: [] } as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.enregistrerAppel).not.toHaveBeenCalled();
    });

    it("l'appel d'une de ses classes est enregistré", async () => {
      await controleur.enregistrerAppel(enseignant, { classeId: 'c1', date: '2026-10-09', entries: [] } as never);
      expect(p.exigerClasse).toHaveBeenCalledWith(enseignant, 'c1');
      expect(service.enregistrerAppel).toHaveBeenCalled();
    });

    it('la lecture par classe et par élève est contrôlée', async () => {
      await controleur.findByClasseAndDate(enseignant, 'c1', '2026-10-09');
      await controleur.findByEleve(enseignant, 'e1');
      expect(p.exigerClasse).toHaveBeenCalledWith(enseignant, 'c1');
      expect(p.exigerEleve).toHaveBeenCalledWith(enseignant, 'e1');
    });

    it("les statistiques sans classe précisée couvrent toutes ses classes, et seulement elles", async () => {
      await controleur.stats(enseignant, undefined);
      expect(service.stats).toHaveBeenCalledWith('ecole', undefined, ['c1', 'c2']);
    });

    it("les statistiques d'une classe précise la contrôlent", async () => {
      p.exigerClasse.mockRejectedValue(refus());
      await expect(controleur.stats(enseignant, 'c9')).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.stats).not.toHaveBeenCalled();
    });
  });

  describe('notes', () => {
    it('lecture et saisie exigent la classe', async () => {
      const service = { findByClasseTrimestre: jest.fn().mockResolvedValue([]), saisir: jest.fn().mockResolvedValue([]) };
      const p = perimetre(true);
      const controleur = new NotesController(service as never, p as never);

      await controleur.findByClasseTrimestre(enseignant, 'c1', '1');
      await controleur.saisir(enseignant, { classeId: 'c2', trimestre: 1, entries: [] } as never);
      expect(p.exigerClasse).toHaveBeenCalledWith(enseignant, 'c1');
      expect(p.exigerClasse).toHaveBeenCalledWith(enseignant, 'c2');

      p.exigerClasse.mockRejectedValue(refus());
      await expect(controleur.saisir(enseignant, { classeId: 'c9', trimestre: 1, entries: [] } as never)).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.saisir).toHaveBeenCalledTimes(1);
    });
  });

  describe('emploi du temps', () => {
    it("l'emploi du temps d'une classe exige la classe", async () => {
      const service = { findByClasse: jest.fn().mockResolvedValue([]), findByPersonnel: jest.fn().mockResolvedValue([]) };
      const p = perimetre(true);
      const controleur = new EmploiDuTempsController(service as never, p as never);
      p.exigerClasse.mockRejectedValue(refus());
      await expect(controleur.findByClasse(enseignant, 'c9')).rejects.toBeInstanceOf(ForbiddenException);
      expect(service.findByClasse).not.toHaveBeenCalled();
    });

    it("l'enseignant ne consulte que son propre emploi du temps", () => {
      const service = { findByClasse: jest.fn(), findByPersonnel: jest.fn().mockResolvedValue([]) };
      const controleur = new EmploiDuTempsController(service as never, perimetre(true) as never);
      expect(() => controleur.findByPersonnel(enseignant, 'autre-enseignant')).toThrow(ForbiddenException);
      expect(service.findByPersonnel).not.toHaveBeenCalled();
      controleur.findByPersonnel(enseignant, 'p1');
      expect(service.findByPersonnel).toHaveBeenCalledWith('ecole', 'p1');
    });

    it("la direction consulte l'emploi du temps de n'importe qui", () => {
      const service = { findByClasse: jest.fn(), findByPersonnel: jest.fn().mockResolvedValue([]) };
      const controleur = new EmploiDuTempsController(service as never, perimetre(false) as never);
      controleur.findByPersonnel(direction, 'p9');
      expect(service.findByPersonnel).toHaveBeenCalledWith('ecole', 'p9');
    });
  });

  describe('données hors enseignement', () => {
    it.each([
      ['tarifs d\'écolage', TarifsEcolageController.prototype, 'findAll'],
      ['frais d\'inscription', FraisInscriptionNiveauController.prototype, 'findAll'],
      ['matériel', LogistiqueController.prototype, 'findAll'],
      ['résumé du matériel', LogistiqueController.prototype, 'resume'],
    ])("%s : l'enseignant n'y a pas accès", (_nom, cible, methode) => {
      const roles = rolesDe(cible, methode);
      expect(roles).toBeDefined();
      expect(roles).not.toContain(RoleUtilisateur.ENSEIGNANT);
      expect(roles).toContain(RoleUtilisateur.FONDATEUR);
    });
  });
});

describe("Accès de l'enseignant : services", () => {
  let prisma: any;

  beforeEach(() => {
    prisma = createPrismaMock();
  });

  describe('ElevesService', () => {
    it("findAll ne retourne que les élèves inscrits dans ses classes, sans adresse", async () => {
      prisma.eleve.findMany.mockResolvedValue([{ id: 'e1', nom: 'A', adresse: 'Rue 1', matricule: 'M1' }]);
      const eleves = await new ElevesService(prisma, {} as never).findAll('ecole', ['c1']);

      expect(prisma.eleve.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        actif: true,
        inscriptions: { some: { statut: 'EN_COURS', classeId: { in: ['c1'] } } },
      });
      expect(eleves).toEqual([{ id: 'e1', nom: 'A', matricule: 'M1' }]);
    });

    it('findAll sans restriction renvoie tout, adresse comprise', async () => {
      prisma.eleve.findMany.mockResolvedValue([{ id: 'e1', adresse: 'Rue 1' }]);
      const eleves = await new ElevesService(prisma, {} as never).findAll('ecole');
      expect(prisma.eleve.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', actif: true });
      expect(eleves).toEqual([{ id: 'e1', adresse: 'Rue 1' }]);
    });

    it("la fiche restreinte n'expose ni factures, ni solde, ni parents, ni adresse, ni admission", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', nom: 'A', adresse: 'Rue 1', inscriptions: [{ classe: { nom: '6eme A' } }] });
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1' });
      prisma.absence.count.mockResolvedValue(2);

      const fiche = await new ElevesService(prisma, {} as never).ficheRestreinte('ecole', 'e1');

      expect(fiche).toEqual({ id: 'e1', nom: 'A', inscriptions: [{ classe: { nom: '6eme A' } }], absencesCount: 2 });
      for (const interdit of ['factures', 'solde', 'parentsLiens', 'demandesInscription', 'adresse']) {
        expect(fiche).not.toHaveProperty(interdit);
      }
      const requete = prisma.eleve.findFirstOrThrow.mock.calls[0][0];
      expect(requete.where).toEqual({ id: 'e1', ecoleId: 'ecole' });
      expect(Object.keys(requete.include)).toEqual(['inscriptions']); // aucune relation financière ni familiale n'est lue
    });
  });

  describe('ClassesService', () => {
    it('findAll limite la liste à ses classes', async () => {
      prisma.classe.findMany.mockResolvedValue([]);
      await new ClassesService(prisma).findAll('ecole', { classeIds: ['c1', 'c2'] });
      expect(prisma.classe.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', actif: true, id: { in: ['c1', 'c2'] } });
    });

    it("les effectifs d'un enseignant ne contiennent ni écolage ni frais d'inscription", async () => {
      prisma.classe.findMany.mockResolvedValue([
        { id: 'c1', nom: '6eme A', niveauId: 'n1', anneeScolaireId: 'a1', capaciteMax: 40, niveau: { nom: '6eme' }, anneeScolaire: { libelle: '2026-2027' }, inscriptions: [{ eleve: { genre: 'F' } }, { eleve: { genre: 'M' } }] },
      ]);
      prisma.fraisInscriptionNiveau.findMany.mockResolvedValue([{ niveauId: 'n1', anneeScolaireId: 'a1', montant: 50000 }]);
      prisma.tarifEcolage.findMany.mockResolvedValue([{ niveauId: 'n1', anneeScolaireId: 'a1', montant: 900000 }]);

      const [restreint] = await new ClassesService(prisma).effectifs('ecole', ['c1']);
      expect(restreint).toMatchObject({ classeId: 'c1', total: 2, filles: 1, garcons: 1 });
      expect(restreint).not.toHaveProperty('ecolage');
      expect(restreint).not.toHaveProperty('fraisInscription');
      expect(prisma.classe.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', actif: true, id: { in: ['c1'] } });

      const [complet] = await new ClassesService(prisma).effectifs('ecole');
      expect(complet).toMatchObject({ ecolage: 900000, fraisInscription: 50000 });
    });
  });

  describe('AbsencesService.stats', () => {
    it("sans classe précisée, un enseignant obtient le cumul de ses classes seulement", async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      await new AbsencesService(prisma, {} as never).stats('ecole', undefined, ['c1', 'c2']);
      expect(prisma.absence.findMany.mock.calls[0][0].where.classeId).toEqual({ in: ['c1', 'c2'] });
    });

    it('une classe précisée reste prioritaire', async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      await new AbsencesService(prisma, {} as never).stats('ecole', 'c1', ['c1', 'c2']);
      expect(prisma.absence.findMany.mock.calls[0][0].where.classeId).toBe('c1');
    });

    it('sans restriction, toutes les classes comptent', async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      await new AbsencesService(prisma, {} as never).stats('ecole');
      expect(prisma.absence.findMany.mock.calls[0][0].where.classeId).toBeUndefined();
    });
  });

  describe('ReportingService.dashboard', () => {
    beforeEach(() => {
      prisma.anneeScolaire.findFirst.mockResolvedValue({ id: 'a1', libelle: '2026-2027' });
      prisma.inscription.count.mockResolvedValue(12);
      prisma.personnel.count.mockResolvedValue(8);
      prisma.facture.findMany.mockResolvedValue([]);
      prisma.absence.findMany.mockResolvedValue([{ statut: 'ABSENT' }]);
    });

    it("pour un enseignant : effectifs et absences de ses classes, ni personnel ni finances lus", async () => {
      const r = await new ReportingService(prisma).dashboard('ecole', ['c1']);

      expect(prisma.inscription.count.mock.calls[0][0].where).toMatchObject({ classeId: { in: ['c1'] } });
      expect(prisma.absence.findMany.mock.calls[0][0].where).toMatchObject({ classeId: { in: ['c1'] } });
      expect(prisma.personnel.count).not.toHaveBeenCalled();
      expect(r.totalPersonnel).toBeUndefined();
      expect(r.perimetre).toEqual({ nbClasses: 1 });
      expect(r.absencesAujourdhui.absents).toBe(1);
      for (const appel of prisma.facture.findMany.mock.calls) expect(appel[0].take).toBe(0); // aucune facture n'est lue
    });

    it('sans restriction, le tableau de bord reste complet', async () => {
      const r = await new ReportingService(prisma).dashboard('ecole');
      expect(r.totalPersonnel).toBe(8);
      expect(r.perimetre).toBeUndefined();
      expect(prisma.inscription.count.mock.calls[0][0].where).not.toHaveProperty('classeId');
    });
  });
});

// garde-fou : le contrôleur de périmètre ne dépend d'aucun module métier
it('PerimetreService se construit avec la seule base de données', () => {
  expect(() => new PerimetreService(createPrismaMock())).not.toThrow();
});
