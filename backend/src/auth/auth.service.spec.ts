import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('AuthService.login', () => {
  let prisma: any;
  let jwt: { sign: jest.Mock };
  let service: AuthService;

  const utilisateur = {
    id: 'u1',
    ecoleId: 'ecole',
    nom: 'Camara',
    prenom: 'Fondateur',
    email: 'fondateur@kalanso.gn',
    role: 'FONDATEUR',
    actif: true,
    motDePasseHash: 'hashed:kalanso2026',
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    jwt = { sign: jest.fn().mockReturnValue('jeton.signe') };
    service = new AuthService(prisma, jwt as any);
    prisma.utilisateur.findUnique.mockResolvedValue(utilisateur);
  });

  it('connecte avec les bons identifiants : jeton + profil sans données sensibles', async () => {
    const r = await service.login('fondateur@kalanso.gn', 'kalanso2026');

    expect(r.accessToken).toBe('jeton.signe');
    expect(r.user).toEqual({
      id: 'u1',
      nom: 'Camara',
      prenom: 'Fondateur',
      email: 'fondateur@kalanso.gn',
      role: 'FONDATEUR',
      ecoleId: 'ecole',
    });
    expect(JSON.stringify(r)).not.toContain('hashed');
  });

  it("le jeton porte l'identité, l'école et le rôle (base de l'isolation multi-école et des droits)", async () => {
    await service.login('fondateur@kalanso.gn', 'kalanso2026');
    expect(jwt.sign).toHaveBeenCalledWith({
      userId: 'u1',
      ecoleId: 'ecole',
      role: 'FONDATEUR',
      email: 'fondateur@kalanso.gn',
    });
  });

  it('mémorise la date de dernière connexion', async () => {
    await service.login('fondateur@kalanso.gn', 'kalanso2026');
    expect(prisma.utilisateur.update.mock.calls[0][0].where).toEqual({ id: 'u1' });
    expect(prisma.utilisateur.update.mock.calls[0][0].data.dernierLoginAt).toBeInstanceOf(Date);
  });

  it('refuse un email inconnu avec le même message qu\'un mauvais mot de passe (pas d\'énumération de comptes)', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    const inconnu = await service.login('x@x.gn', 'a').catch((e) => e);
    const mauvaisMdp = await service.login('fondateur@kalanso.gn', 'faux').catch((e) => e);

    expect(inconnu).toBeInstanceOf(UnauthorizedException);
    expect(mauvaisMdp).toBeInstanceOf(UnauthorizedException);
    expect(inconnu.message).toBe(mauvaisMdp.message);
  });

  it('refuse un compte désactivé, même avec le bon mot de passe', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ ...utilisateur, actif: false });
    await expect(service.login('fondateur@kalanso.gn', 'kalanso2026')).rejects.toThrow(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
  });

  it("un mot de passe erroné n'émet aucun jeton et ne met pas à jour la dernière connexion", async () => {
    await expect(service.login('fondateur@kalanso.gn', 'faux')).rejects.toThrow(UnauthorizedException);
    expect(jwt.sign).not.toHaveBeenCalled();
    expect(prisma.utilisateur.update).not.toHaveBeenCalled();
  });
});
