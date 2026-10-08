import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { UtilisateursService } from './utilisateurs.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('UtilisateursService', () => {
  let prisma: any;
  let service: UtilisateursService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new UtilisateursService(prisma);
  });

  describe('findAll', () => {
    it("ne renvoie jamais le hash du mot de passe", async () => {
      prisma.utilisateur.findMany.mockResolvedValue([]);
      await service.findAll('ecole');
      const select = prisma.utilisateur.findMany.mock.calls[0][0].select;
      expect(select).toBeDefined();
      expect(select.motDePasseHash).toBeUndefined();
      expect(select).toMatchObject({ id: true, email: true, role: true, actif: true });
    });
  });

  describe('create', () => {
    const dto = { nom: 'Bah', prenom: 'Aissatou', email: 'a@kalanso.gn', password: 'secret123', role: 'SECRETAIRE' } as any;

    it('refuse un email déjà utilisé', async () => {
      prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u0' });
      await expect(service.create('ecole', dto)).rejects.toThrow(BadRequestException);
      expect(prisma.utilisateur.create).not.toHaveBeenCalled();
    });

    it("hache le mot de passe (jamais stocké en clair) et rattache le compte à l'école", async () => {
      prisma.utilisateur.findUnique.mockResolvedValue(null);
      prisma.utilisateur.create.mockImplementation(async ({ data }: any) => ({ id: 'u1', ...data }));

      await service.create('ecole', dto);

      const data = prisma.utilisateur.create.mock.calls[0][0].data;
      expect(data.motDePasseHash).toBe('hashed:secret123');
      expect(data.motDePasseHash).not.toBe('secret123');
      expect(data).toMatchObject({ ecoleId: 'ecole', email: 'a@kalanso.gn', role: 'SECRETAIRE' });
      expect(data.password).toBeUndefined();
    });
  });

  describe('update', () => {
    beforeEach(() => prisma.utilisateur.findFirst.mockResolvedValue({ id: 'u1' }));

    it("404 si le compte n'est pas dans cette école", async () => {
      prisma.utilisateur.findFirst.mockResolvedValue(null);
      await expect(service.update('ecole', 'u1', {}, 'admin')).rejects.toThrow(NotFoundException);
      expect(prisma.utilisateur.findFirst.mock.calls[0][0].where).toEqual({ id: 'u1', ecoleId: 'ecole' });
    });

    it("interdit de désactiver son propre compte", async () => {
      await expect(service.update('ecole', 'admin', { actif: false }, 'admin')).rejects.toThrow(ForbiddenException);
      expect(prisma.utilisateur.update).not.toHaveBeenCalled();
    });

    it("permet de désactiver le compte d'un autre, et de réactiver le sien", async () => {
      await service.update('ecole', 'u2', { actif: false }, 'admin');
      expect(prisma.utilisateur.update.mock.calls[0][0].data.actif).toBe(false);

      await service.update('ecole', 'admin', { actif: true }, 'admin');
      expect(prisma.utilisateur.update.mock.calls[1][0].data.actif).toBe(true);
    });

    it("ne touche au mot de passe que s'il est fourni (et le hache)", async () => {
      await service.update('ecole', 'u1', { nom: 'Nouveau' }, 'admin');
      expect(prisma.utilisateur.update.mock.calls[0][0].data).not.toHaveProperty('motDePasseHash');

      await service.update('ecole', 'u1', { password: 'nouveau-mdp' }, 'admin');
      expect(prisma.utilisateur.update.mock.calls[1][0].data.motDePasseHash).toBe('hashed:nouveau-mdp');
    });
  });
});
