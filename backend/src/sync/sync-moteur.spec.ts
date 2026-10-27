import { appliquer, empreinte, modelesSynchronises, normaliser } from './sync-moteur';
import { formaterNumeroRecu } from '../finances/numero-recu.util';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('Synchronisation : moteur', () => {
  it('échange toutes les tables sauf celles de la synchronisation', () => {
    const modeles = modelesSynchronises();
    expect(modeles).toEqual(expect.arrayContaining(['Eleve', 'Facture', 'Paiement', 'Note', 'Utilisateur']));
    expect(modeles).not.toEqual(expect.arrayContaining(['SyncEtat']));
    expect(modeles.some((m) => m.startsWith('Sync'))).toBe(false);
  });

  it('normalise dates et décimaux, et donne la même empreinte quel que soit l’ordre des champs', () => {
    const decimal = { d: [1], toFixed: () => '', toString: () => '2500000' };
    expect(normaliser({ b: new Date('2026-10-17T10:00:00Z'), a: decimal, c: ['INTERNAT'] })).toEqual({
      a: '2500000',
      b: '2026-10-17T10:00:00.000Z',
      c: ['INTERNAT'],
    });
    expect(empreinte({ x: 1, y: 'a' })).toBe(empreinte({ y: 'a', x: 1 }));
    expect(empreinte({ x: 1 })).not.toBe(empreinte({ x: 2 }));
  });

  it('applique en plusieurs passes quand une ligne dépend d’une autre pas encore créée', async () => {
    const prisma = createPrismaMock();
    const crees = new Set<string>();
    prisma.facture.upsert.mockImplementation(async ({ create }: any) => {
      if (!crees.has(create.eleveId)) throw Object.assign(new Error('Foreign key constraint'), { code: 'P2003' });
      crees.add(create.id);
    });
    prisma.eleve.upsert.mockImplementation(async ({ create }: any) => crees.add(create.id));
    const r = await appliquer(prisma, [
      { modele: 'Facture', id: 'f1', operation: 'maj', donnees: { id: 'f1', eleveId: 'e1' }, modifieLe: '2026-10-17T10:00:00Z' },
      { modele: 'Eleve', id: 'e1', operation: 'maj', donnees: { id: 'e1' }, modifieLe: '2026-10-17T10:00:00Z' },
    ]);
    expect(r.appliques.map((c) => c.id)).toEqual(['e1', 'f1']);
    expect(r.echecs).toEqual([]);
  });

  it('numéros de reçu : série de l’école, puis série « Bn » des postes bureau', () => {
    expect(formaterNumeroRecu({ id: 'x', numero: 4853 })).toBe('004853');
    expect(formaterNumeroRecu({ id: 'x', numero: 1000001 })).toBe('B1-000001');
    expect(formaterNumeroRecu({ id: 'x', numero: 2000123 })).toBe('B2-000123');
    expect(formaterNumeroRecu({ id: 'x', numero: null })).toBe('x');
  });
});
