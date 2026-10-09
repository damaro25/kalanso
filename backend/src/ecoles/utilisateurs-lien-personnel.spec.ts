import { BadRequestException } from '@nestjs/common';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { UtilisateursService } from './utilisateurs.service';

describe('UtilisateursService : lien entre un compte enseignant et sa fiche du personnel', () => {
  let prisma: any;
  let service: UtilisateursService;

  const dto = (surcharge: Record<string, unknown> = {}) => ({ nom: 'Sylla', prenom: 'Fanta', email: 'f@x.gn', password: 'secret123', role: 'ENSEIGNANT', ...surcharge }) as any;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UtilisateursService(prisma);
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    prisma.utilisateur.findFirst.mockResolvedValue(null);
    prisma.utilisateur.create.mockImplementation(async (a: any) => ({ id: 'u1', ...a.data }));
    prisma.utilisateur.update.mockImplementation(async (a: any) => ({ id: 'u1', ...a.data }));
    prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT', actif: true });
  });

  describe('création', () => {
    it("relie le compte à la fiche d'un enseignant de l'école", async () => {
      await service.create('ecole', dto({ personnelId: 'p1' }));
      expect(prisma.personnel.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', ecoleId: 'ecole', actif: true });
      expect(prisma.utilisateur.create.mock.calls[0][0].data.personnelId).toBe('p1');
    });

    it('un compte enseignant sans fiche du personnel est refusé', async () => {
      await expect(service.create('ecole', dto())).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it("refuse une fiche d'une autre école ou inexistante", async () => {
      prisma.personnel.findFirst.mockResolvedValue(null);
      await expect(service.create('ecole', dto({ personnelId: 'etranger' }))).rejects.toThrow("n'existe pas");
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it("refuse la fiche d'un membre du personnel qui n'est pas enseignant", async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', actif: true });
      await expect(service.create('ecole', dto({ personnelId: 'p1' }))).rejects.toThrow("n'existe pas");
    });

    it('refuse une fiche déjà reliée à un autre compte', async () => {
      prisma.utilisateur.findFirst.mockResolvedValue({ id: 'autre' });
      await expect(service.create('ecole', dto({ personnelId: 'p1' }))).rejects.toThrow('a déjà un compte');
    });

    it("ignore la fiche pour un rôle qui n'est pas enseignant", async () => {
      await service.create('ecole', dto({ role: 'SECRETAIRE', personnelId: 'p1' }));
      expect(prisma.personnel.findFirst).not.toHaveBeenCalled();
      expect(prisma.utilisateur.create.mock.calls[0][0].data.personnelId).toBeNull();
    });
  });

  describe('modification', () => {
    const compte = (surcharge: Record<string, unknown> = {}) => ({ id: 'u1', ecoleId: 'ecole', role: 'ENSEIGNANT', personnelId: null, ...surcharge });

    it("relie un ancien compte enseignant à une fiche", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(compte()).mockResolvedValueOnce(null);
      await service.update('ecole', 'u1', { personnelId: 'p1' } as any, 'admin');
      expect(prisma.utilisateur.update.mock.calls[0][0].data.personnelId).toBe('p1');
    });

    it("un même compte peut garder sa propre fiche (pas de faux conflit avec lui-même)", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(compte({ personnelId: 'p1' })).mockResolvedValueOnce(null);
      await service.update('ecole', 'u1', { personnelId: 'p1', nom: 'Nouveau' } as any, 'admin');
      expect(prisma.utilisateur.findFirst.mock.calls[1][0].where).toEqual({ personnelId: 'p1', NOT: { id: 'u1' } });
    });

    it("désactiver ou réinitialiser le mot de passe d'un ancien compte non relié reste possible", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(compte());
      await service.update('ecole', 'u1', { actif: false } as any, 'admin');
      expect(prisma.personnel.findFirst).not.toHaveBeenCalled();
      expect(prisma.utilisateur.update.mock.calls[0][0].data).not.toHaveProperty('personnelId');
    });

    it("passer un compte au rôle enseignant exige une fiche", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(compte({ role: 'SECRETAIRE' }));
      await expect(service.update('ecole', 'u1', { role: 'ENSEIGNANT' } as any, 'admin')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it("quitter le rôle enseignant retire le lien avec la fiche", async () => {
      prisma.utilisateur.findFirst.mockResolvedValueOnce(compte({ personnelId: 'p1' }));
      await service.update('ecole', 'u1', { role: 'SECRETAIRE' } as any, 'admin');
      expect(prisma.utilisateur.update.mock.calls[0][0].data.personnelId).toBeNull();
    });
  });

  it("la liste des comptes indique la fiche du personnel reliée, sans le mot de passe", async () => {
    prisma.utilisateur.findMany.mockResolvedValue([]);
    await service.findAll('ecole');
    const select = prisma.utilisateur.findMany.mock.calls[0][0].select;
    expect(select.personnelId).toBe(true);
    expect(select.personnel).toBeDefined();
    expect(select).not.toHaveProperty('motDePasseHash');
  });
});
