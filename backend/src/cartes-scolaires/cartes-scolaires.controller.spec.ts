import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../common/decorators/roles.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { CartesScolairesController, ROLES_CARTES } from './cartes-scolaires.controller';

const proto = CartesScolairesController.prototype as unknown as Record<string, unknown>;

describe('CartesScolairesController : droits', () => {
  it("est réservé au fondateur, au chef d'établissement et à la secrétaire pour toutes les routes", () => {
    expect(Reflect.getMetadata(ROLES_KEY, CartesScolairesController)).toEqual(ROLES_CARTES);
    expect(ROLES_CARTES).toEqual([RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.SECRETAIRE]);
    expect(ROLES_CARTES).not.toContain(RoleUtilisateur.ENSEIGNANT);
    expect(ROLES_CARTES).not.toContain(RoleUtilisateur.COMPTABLE);
  });

  it.each(['photo', 'televerserPhoto', 'supprimerPhoto', 'infoEleve', 'pdfEleve', 'apercuClasse', 'pdfClasse'])(
    '%s ne rouvre pas la route à d\'autres rôles',
    (methode) => {
      expect(Reflect.getMetadata(ROLES_KEY, proto[methode] as object)).toBeUndefined();
    },
  );
});

describe('CartesScolairesController : téléversement', () => {
  const service = { televerserPhoto: jest.fn().mockResolvedValue({ photo: 'ELEVE' }) };
  const controleur = new CartesScolairesController(service as never);
  const user = { ecoleId: 'e1' } as never;

  it("refuse une requête sans fichier", () => {
    expect(() => controleur.televerserPhoto(user, 'eleve1', undefined)).toThrow(BadRequestException);
    expect(service.televerserPhoto).not.toHaveBeenCalled();
  });

  it("transmet le fichier au service avec l'école de l'utilisateur", async () => {
    const fichier = { filename: 'a.jpg', path: '/x/a.jpg', mimetype: 'image/jpeg' };
    await controleur.televerserPhoto(user, 'eleve1', fichier);
    expect(service.televerserPhoto).toHaveBeenCalledWith('e1', 'eleve1', fichier);
  });
});
