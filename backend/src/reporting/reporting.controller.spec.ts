import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { ReportingController, ROLES_EXPORT_DIRECTION, ROLES_EXPORT_FINANCE } from './reporting.controller';

const proto = ReportingController.prototype as unknown as Record<string, unknown>;
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
  const controleur = new ReportingController({ dashboard: jest.fn().mockResolvedValue(complet) } as never, {} as never);
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
  const controleur = new ReportingController({} as never, exportService as never);
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
