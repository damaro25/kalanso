import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { Roles, ROLES_KEY } from '../decorators/roles.decorator';

function contexte(user: unknown, handler: Function, classe: Function = class {}) {
  return {
    getHandler: () => handler,
    getClass: () => classe,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('RolesGuard', () => {
  const guard = new RolesGuard(new Reflector());

  class Ctrl {
    @Roles('CHEF_ETABLISSEMENT', 'FONDATEUR')
    reservee() {}

    libre() {}
  }

  @Roles('SECRETAIRE')
  class CtrlRestreint {
    heritee() {}

    @Roles('CHEF_ETABLISSEMENT')
    surcharge() {}
  }

  it('le décorateur @Roles stocke les rôles sous la clé « roles »', () => {
    expect(Reflect.getMetadata(ROLES_KEY, Ctrl.prototype.reservee)).toEqual(['CHEF_ETABLISSEMENT', 'FONDATEUR']);
  });

  it('autorise tout utilisateur connecté quand la route ne déclare aucun rôle', () => {
    expect(guard.canActivate(contexte({ role: 'ENSEIGNANT' }, Ctrl.prototype.libre, Ctrl))).toBe(true);
  });

  it('autorise un rôle listé', () => {
    expect(guard.canActivate(contexte({ role: 'CHEF_ETABLISSEMENT' }, Ctrl.prototype.reservee, Ctrl))).toBe(true);
  });

  it('refuse un rôle non listé', () => {
    expect(guard.canActivate(contexte({ role: 'ENSEIGNANT' }, Ctrl.prototype.reservee, Ctrl))).toBe(false);
  });

  it('refuse une requête sans utilisateur sur une route protégée', () => {
    expect(guard.canActivate(contexte(undefined, Ctrl.prototype.reservee, Ctrl))).toBe(false);
  });

  it('hérite des rôles de la classe, et la méthode les surcharge', () => {
    const user = (role: string) => contexte({ role }, CtrlRestreint.prototype.heritee, CtrlRestreint);
    expect(guard.canActivate(user('SECRETAIRE'))).toBe(true);
    expect(guard.canActivate(user('CHEF_ETABLISSEMENT'))).toBe(false);

    const surcharge = (role: string) => contexte({ role }, CtrlRestreint.prototype.surcharge, CtrlRestreint);
    expect(guard.canActivate(surcharge('CHEF_ETABLISSEMENT'))).toBe(true);
    expect(guard.canActivate(surcharge('SECRETAIRE'))).toBe(false);
  });
});
