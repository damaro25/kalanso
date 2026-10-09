import { estFraisEtudes, typeOperation } from './type-operation.util';
import { libelleFraisInscription, montantFraisInscription } from './inscription.util';

describe('typeOperation (déduit de la facture)', () => {
  it.each([
    ["Frais d'inscription - 5eme A", 'Inscription'],
    ['Frais de réinscription - 5eme A', 'Réinscription'],
    ['Frais de reinscription - CP1', 'Réinscription'],
    ['FRAIS DE RÉINSCRIPTION', 'Réinscription'],
  ])('facture d\'inscription « %s » -> %s', (libelle, attendu) => {
    expect(typeOperation({ type: 'INSCRIPTION', libelle })).toBe(attendu);
  });

  it.each([
    ['Trimestre 1', 'Trimestre 1'],
    ['Écolage trimestre 2', 'Trimestre 2'],
    ['TRIMESTRE 3', 'Trimestre 3'],
    ['1er trimestre', 'Trimestre 1'],
    ['2ème trimestre', 'Trimestre 2'],
    ['3eme trimestre', 'Trimestre 3'],
    ['Ecolage T1', 'Trimestre 1'],
    ['Écolage T 3', 'Trimestre 3'],
  ])('facture d\'écolage « %s » -> %s', (libelle, attendu) => {
    expect(typeOperation({ type: 'ECOLAGE', libelle })).toBe(attendu);
  });

  it.each(['Ecolage Annuel', 'Écolage', 'Scolarité 2026', 'Trimestre 4', 'Contrat T10', 'Atelier CT2'])(
    "écolage sans trimestre reconnu « %s » -> Écolage",
    (libelle) => {
      expect(typeOperation({ type: 'ECOLAGE', libelle })).toBe('Écolage');
    },
  );

  it('toute autre facture est « Autre », quel que soit son libellé', () => {
    expect(typeOperation({ type: 'AUTRE', libelle: 'Cantine Trimestre 1' })).toBe('Autre');
    expect(typeOperation({ type: 'AUTRE', libelle: 'Transport' })).toBe('Autre');
  });

  it("le libellé d'écolage ne change pas le type d'une facture d'inscription, et inversement", () => {
    expect(typeOperation({ type: 'INSCRIPTION', libelle: 'Trimestre 1' })).toBe('Inscription');
    expect(typeOperation({ type: 'ECOLAGE', libelle: 'Réinscription annuelle' })).toBe('Écolage');
  });

  it('estFraisEtudes : écolage et trimestres seulement', () => {
    expect(['Écolage', 'Trimestre 1', 'Trimestre 2', 'Trimestre 3'].every((t) => estFraisEtudes(t as any))).toBe(true);
    expect(['Inscription', 'Réinscription', 'Autre'].some((t) => estFraisEtudes(t as any))).toBe(false);
  });
});

describe('frais d\'inscription (règles communes)', () => {
  it('montantFraisInscription : tarif nouveaux, ou tarif de réinscription quand l\'élève revient', () => {
    const frais = { montant: 75000, montantReinscription: 40000 };
    expect(montantFraisInscription(frais, false)).toBe(75000);
    expect(montantFraisInscription(frais, true)).toBe(40000);
  });

  it('une réinscription sans tarif dédié retombe sur le tarif nouveaux', () => {
    expect(montantFraisInscription({ montant: 75000, montantReinscription: null }, true)).toBe(75000);
    expect(montantFraisInscription({ montant: 75000 }, true)).toBe(75000);
  });

  it('lit aussi les montants décimaux renvoyés comme chaînes par la base', () => {
    expect(montantFraisInscription({ montant: '75000.00', montantReinscription: '40000.00' }, true)).toBe(40000);
  });

  it('sans frais défini pour le niveau : 0', () => {
    expect(montantFraisInscription(null, false)).toBe(0);
    expect(montantFraisInscription(undefined, true)).toBe(0);
  });

  it('libelleFraisInscription : inscription ou réinscription, avec la classe', () => {
    expect(libelleFraisInscription(false, '5eme A')).toBe("Frais d'inscription - 5eme A");
    expect(libelleFraisInscription(true, '5eme A')).toBe('Frais de réinscription - 5eme A');
  });
});
