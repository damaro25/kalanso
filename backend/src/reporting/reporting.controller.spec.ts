import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ReportingController, ROLES_EXPORT_DIRECTION, ROLES_EXPORT_FINANCE } from './reporting.controller';

const proto = ReportingController.prototype as unknown as Record<string, unknown>;

// Périmètre sans restriction (tous les rôles sauf l'enseignant)
const perimetreLibre = () => ({
  classesAutorisees: jest.fn().mockResolvedValue(null),
  exigerClasse: jest.fn().mockResolvedValue(undefined),
  exigerEleve: jest.fn().mockResolvedValue(undefined),
  estRestreint: jest.fn().mockReturnValue(false),
});
const rolesDe = (methode: string) => Reflect.getMetadata(ROLES_KEY, proto[methode] as object) as RoleUtilisateur[] | undefined;

describe('ReportingController : droits des exports', () => {
  // Les exports financiers et de paie ne doivent pas être plus ouverts que les API de finance et de paie.
  it.each(['exportImpayes', 'exportFactures', 'exportFacturesModele', 'exportPaieModele', 'exportBulletinPaiePdf', 'exportCahierPaie'])(
    '%s est réservé au fondateur, au chef d\'établissement et au comptable',
    (methode) => {
      const roles = rolesDe(methode);
      expect(roles).toEqual(ROLES_EXPORT_FINANCE);
      expect(roles).toEqual(expect.arrayContaining([RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE]));
      expect(roles).not.toContain(RoleUtilisateur.ENSEIGNANT);
      expect(roles).not.toContain(RoleUtilisateur.SECRETAIRE);
    },
  );

  it.each(['exportInventaire', 'exportParcoursClasse'])('%s est réservé au fondateur et au chef d\'établissement', (methode) => {
    const roles = rolesDe(methode);
    expect(roles).toEqual(ROLES_EXPORT_DIRECTION);
    expect(roles).not.toContain(RoleUtilisateur.COMPTABLE);
    expect(roles).not.toContain(RoleUtilisateur.ENSEIGNANT);
    expect(roles).not.toContain(RoleUtilisateur.SECRETAIRE);
  });

  // Les exports pédagogiques restent ouverts à tous les rôles connectés (enseignants compris).
  it.each(['dashboard', 'exportEleves', 'exportBulletin', 'exportBulletinPdf', 'exportAppel', 'exportEmploiDuTempsXlsx', 'exportEmploiDuTempsPdf', 'exportNotesClasse'])(
    '%s reste accessible à tous les rôles',
    (methode) => {
      expect(rolesDe(methode)).toBeUndefined();
    },
  );
});

describe('ReportingController : tableau de bord', () => {
  const complet = {
    anneeScolaire: { id: 'a1', libelle: '2026-2027' },
    totalEleves: 5,
    totalPersonnel: 3,
    fraisInscription: { encaisse: 290000 },
    impayes: { nombre: 6, montant: 3860000 },
    absencesAujourdhui: { absents: 0, retards: 0, presents: 0 },
  };
  const controleur = new ReportingController({ dashboard: jest.fn().mockResolvedValue(complet) } as never, {} as never, perimetreLibre() as never);
  const comme = (role: string) => controleur.dashboard({ ecoleId: 'e1', role } as never);

  it.each([RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE])('%s voit les montants', async (role) => {
    expect(await comme(role)).toEqual(complet);
  });

  it.each([RoleUtilisateur.SECRETAIRE, RoleUtilisateur.ENSEIGNANT])('%s ne reçoit ni les frais encaissés ni les impayés', async (role) => {
    const resultat = (await comme(role)) as Record<string, unknown>;
    expect(resultat).not.toHaveProperty('fraisInscription');
    expect(resultat).not.toHaveProperty('impayes');
    expect(resultat).toMatchObject({ totalEleves: 5, totalPersonnel: 3, absencesAujourdhui: complet.absencesAujourdhui });
  });

  it('un rôle inconnu est traité comme non autorisé', async () => {
    expect(await comme('INCONNU')).not.toHaveProperty('impayes');
  });
});

describe('ReportingController : cahier de paie', () => {
  const exportService = { cahierPaieXlsx: jest.fn().mockResolvedValue(Buffer.from('xlsx')) };
  const controleur = new ReportingController({} as never, exportService as never, perimetreLibre() as never);
  const user = { ecoleId: 'e1' } as never;
  const res = { set: jest.fn(), send: jest.fn() } as never;

  beforeEach(() => jest.clearAllMocks());

  it.each([
    [undefined, undefined],
    ['abc', '2026'],
    ['0', '2026'],
    ['13', '2026'],
    ['10', undefined],
    ['10', '26'],
  ])('refuse mois=%s annee=%s avec une 400 plutôt qu\'une 500', async (mois, annee) => {
    await expect(controleur.exportCahierPaie(user, mois as never, annee as never, res)).rejects.toBeInstanceOf(BadRequestException);
    expect(exportService.cahierPaieXlsx).not.toHaveBeenCalled();
  });

  it('génère le cahier pour un mois et une année valides', async () => {
    await controleur.exportCahierPaie(user, '10', '2026', res);
    expect(exportService.cahierPaieXlsx).toHaveBeenCalledWith('e1', 10, 2026);
  });
});

describe("ReportingController : périmètre de l'enseignant", () => {
  const res = () => ({ set: jest.fn(), send: jest.fn() }) as never;
  const user = { ecoleId: 'e1', role: 'ENSEIGNANT', userId: 'u1', personnelId: 'p1' } as never;
  let perimetre: ReturnType<typeof perimetreLibre>;
  let reporting: { dashboard: jest.Mock };
  let exports: Record<string, jest.Mock>;
  let controleur: ReportingController;

  beforeEach(() => {
    perimetre = perimetreLibre();
    perimetre.classesAutorisees.mockResolvedValue(['c1', 'c2']);
    perimetre.estRestreint.mockReturnValue(true);
    reporting = { dashboard: jest.fn().mockResolvedValue({ anneeScolaire: {}, totalEleves: 3, fraisInscription: { encaisse: 0 }, impayes: { nombre: 0, montant: 0 }, absencesAujourdhui: {} }) };
    exports = {
      elevesXlsx: jest.fn().mockResolvedValue(Buffer.from('x')),
      bulletinXlsx: jest.fn().mockResolvedValue(Buffer.from('x')),
      bulletinPdf: jest.fn().mockResolvedValue(Buffer.from('x')),
      appelXlsx: jest.fn().mockResolvedValue(Buffer.from('x')),
      notesClasseXlsx: jest.fn().mockResolvedValue(Buffer.from('x')),
      emploiDuTempsXlsx: jest.fn().mockResolvedValue(Buffer.from('x')),
      emploiDuTempsPdf: jest.fn().mockResolvedValue(Buffer.from('x')),
    };
    controleur = new ReportingController(reporting as never, exports as never, perimetre as never);
  });

  it("le tableau de bord est calculé sur les seules classes de l'enseignant", async () => {
    await controleur.dashboard(user);
    expect(reporting.dashboard).toHaveBeenCalledWith('e1', ['c1', 'c2']);
  });

  it("la liste d'élèves exportée est limitée à ses classes", async () => {
    await controleur.exportEleves(user, undefined, res());
    expect(exports.elevesXlsx).toHaveBeenCalledWith('e1', undefined, ['c1', 'c2']);
  });

  it("l'export d'une classe précise exige qu'elle fasse partie de ses classes", async () => {
    await controleur.exportEleves(user, 'c1', res());
    expect(perimetre.exigerClasse).toHaveBeenCalledWith(user, 'c1');
  });

  it.each([
    ["feuille d'appel", (c: ReportingController) => c.exportAppel(user, 'cX', '2026-10-09', res()), 'appelXlsx'],
    ['notes de la classe', (c: ReportingController) => c.exportNotesClasse(user, 'cX', '1', res()), 'notesClasseXlsx'],
    ['emploi du temps Excel', (c: ReportingController) => c.exportEmploiDuTempsXlsx(user, 'cX', res()), 'emploiDuTempsXlsx'],
    ['emploi du temps PDF', (c: ReportingController) => c.exportEmploiDuTempsPdf(user, 'cX', res()), 'emploiDuTempsPdf'],
  ])("%s : refusé quand la classe n'est pas la sienne, sans rien générer", async (_nom, appel, methode) => {
    perimetre.exigerClasse.mockRejectedValue(new ForbiddenException('hors périmètre'));
    await expect(appel(controleur)).rejects.toBeInstanceOf(ForbiddenException);
    expect(exports[methode]).not.toHaveBeenCalled();
  });

  it.each([
    ['bulletin Excel', (c: ReportingController) => c.exportBulletin(user, 'eX', '1', res()), 'bulletinXlsx'],
    ['bulletin PDF', (c: ReportingController) => c.exportBulletinPdf(user, 'eX', '1', res()), 'bulletinPdf'],
  ])("%s : refusé quand l'élève n'est pas dans ses classes", async (_nom, appel, methode) => {
    perimetre.exigerEleve.mockRejectedValue(new ForbiddenException('hors périmètre'));
    await expect(appel(controleur)).rejects.toBeInstanceOf(ForbiddenException);
    expect(exports[methode]).not.toHaveBeenCalled();
  });
});
