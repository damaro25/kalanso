import { montantEnLettres } from './montant-lettres.util';

describe('montantEnLettres', () => {
  it.each([
    [0, 'zéro'],
    [21, 'vingt et un'],
    [71, 'soixante et onze'],
    [80, 'quatre-vingts'],
    [91, 'quatre-vingt-onze'],
    [200, 'deux cents'],
    [1000, 'mille'],
    [50000, 'cinquante mille'],
    [200000, 'deux cent mille'],
    [850000, 'huit cent cinquante mille'],
    [1000000, 'un million'],
    [2500000, 'deux millions cinq cent mille'],
    [3500750, 'trois millions cinq cent mille sept cent cinquante'],
  ])('%d → %s', (n, attendu) => {
    expect(montantEnLettres(n)).toBe(attendu);
  });
});
