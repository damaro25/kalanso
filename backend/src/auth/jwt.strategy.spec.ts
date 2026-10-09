import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('JwtStrategy.validate (session relue en base)', () => {
  let prisma: any;
  let strategie: JwtStrategy;

  // Contenu d'un jeton émis avant un changement d'école ou de rôle
  const ancienJeton = { userId: 'u1', ecoleId: 'ecole-demo', role: 'COMPTABLE', email: 'ancien@exemple.gn' };

  beforeAll(() => {
    process.env.JWT_SECRET = process.env.JWT_SECRET ?? 'secret-de-test';
  });

  beforeEach(() => {
    prisma = createPrismaMock();
    strategie = new JwtStrategy(prisma);
  });

  it("renvoie l'école, le rôle et l'e-mail actuels de la base, pas ceux du jeton", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({
      id: 'u1',
      ecoleId: 'ecole-la-cible',
      role: 'FONDATEUR',
      email: 'fondateur@exemple.gn',
      actif: true,
    });

    const user = await strategie.validate(ancienJeton);

    expect(user).toEqual({ userId: 'u1', ecoleId: 'ecole-la-cible', role: 'FONDATEUR', email: 'fondateur@exemple.gn' });
  });

  it("renvoie la fiche du personnel liée au compte, qui sert à retrouver les classes d'un enseignant", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', ecoleId: 'e', role: 'ENSEIGNANT', email: 'x', actif: true, personnelId: 'p1' });

    const user = await strategie.validate(ancienJeton);

    expect(user.personnelId).toBe('p1');
    expect(prisma.utilisateur.findUnique.mock.calls[0][0].select.personnelId).toBe(true);
  });

  it("cherche la personne par l'identifiant du jeton, et seulement les champs utiles", async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', ecoleId: 'e', role: 'FONDATEUR', email: 'x', actif: true });

    await strategie.validate(ancienJeton);

    const arg = prisma.utilisateur.findUnique.mock.calls[0][0];
    expect(arg.where).toEqual({ id: 'u1' });
    expect(arg.select).not.toHaveProperty('motDePasseHash'); // jamais le mot de passe haché
  });

  it('refuse un compte désactivé, même avec un jeton encore valide', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue({ id: 'u1', ecoleId: 'e', role: 'FONDATEUR', email: 'x', actif: false });
    await expect(strategie.validate(ancienJeton)).rejects.toThrow(UnauthorizedException);
  });

  it('refuse un compte supprimé', async () => {
    prisma.utilisateur.findUnique.mockResolvedValue(null);
    await expect(strategie.validate(ancienJeton)).rejects.toThrow('Session expirée');
  });
});
