import { abregerInscription, detailResteAPayer, pourGroupe } from './reste-recu.util';

const f = (type: string, libelle: string, montantTotal: number, montantPaye: number) => ({ type, libelle, montantTotal, montantPaye });

describe('Reste à payer du reçu', () => {
  it('montant restant si la tranche est entamée, la tranche seule s’il en reste tout le montant', () => {
    expect(
      detailResteAPayer([
        f('ASSURANCE', 'T-shirt 2026-2027', 50000, 0),
        f('ECOLAGE', 'Externat - Tranche 3', 300000, 0),
        f('ECOLAGE', 'Externat - Tranche 1', 1000000, 800000),
        f('ECOLAGE', 'Externat - Tranche 2', 400000, 170000),
      ]),
    ).toBe('200.000T1 + 230.000T2 + T3 + T-shirt');
  });

  it('ignore ce qui est soldé et abrège inscription / réinscription', () => {
    expect(
      detailResteAPayer([
        f('INSCRIPTION', 'Frais de réinscription - 6ème Année', 50000, 0),
        f('ECOLAGE', 'Externat - Tranche 1', 1000000, 1000000),
        f('ASSURANCE', 'T-shirt 2026-2027', 50000, 20000),
      ]),
    ).toBe('reinscr. + 30.000T-shirt');
    expect(detailResteAPayer([f('INSCRIPTION', "Frais d'inscription - CP", 100000, 0)])).toBe('inscr.');
    expect(detailResteAPayer([])).toBe('');
  });

  it('abrège dans un libellé', () => {
    expect(abregerInscription("Frais d'inscription - 6ème Année")).toBe("Frais d'inscr. - 6ème Année");
    expect(abregerInscription('Frais de réinscription - CP')).toBe('Frais de reinscr. - CP');
  });

  it('« Pour » d’un reçu groupé : insc + T-sh + T1', () => {
    expect(
      pourGroupe([
        { type: 'ECOLAGE', libelle: 'Externat - Tranche 1' },
        { type: 'ASSURANCE', libelle: 'T-shirt 2026-2027' },
        { type: 'INSCRIPTION', libelle: "Frais d'inscription - CP" },
      ]),
    ).toBe('insc + T-sh + T1');
    expect(pourGroupe([{ type: 'INSCRIPTION', libelle: 'Frais de réinscription - CP' }, { type: 'ECOLAGE', libelle: 'Externat - Tranche 2' }])).toBe('reinsc + T2');
  });
});
