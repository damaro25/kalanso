import { BadRequestException } from '@nestjs/common';
import { BulletinService, calculerMoyenne, mention } from './bulletin.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('calculerMoyenne', () => {
  it('fait la moyenne pondérée par les coefficients', () => {
    // (8*2 + 4*1) / 3 = 6.666...
    expect(calculerMoyenne([{ valeur: 8, coefficient: 2 }, { valeur: 4, coefficient: 1 }])).toBeCloseTo(6.6667, 4);
  });

  it('renvoie 0 sans note (évite la division par zéro)', () => {
    expect(calculerMoyenne([])).toBe(0);
  });

  it('renvoie 0 si tous les coefficients sont nuls', () => {
    expect(calculerMoyenne([{ valeur: 9, coefficient: 0 }])).toBe(0);
  });

  it('accepte des coefficients décimaux', () => {
    expect(calculerMoyenne([{ valeur: 10, coefficient: 0.5 }, { valeur: 0, coefficient: 0.5 }])).toBe(5);
  });
});

describe('mention (barème sur 10)', () => {
  it.each([
    [10, 'Très Bien'],
    [8, 'Très Bien'],
    [7.99, 'Bien'],
    [7, 'Bien'],
    [6.5, 'Assez Bien'],
    [6, 'Assez Bien'],
    [5.5, 'Passable'],
    [5, 'Passable'],
    [4.99, 'Insuffisant'],
    [0, 'Insuffisant'],
  ])('moyenne %p => %s', (moyenne, attendu) => {
    expect(mention(moyenne)).toBe(attendu);
  });
});

describe('BulletinService.calculer', () => {
  let prisma: any;
  let service: BulletinService;

  const inscription = {
    classeId: 'c1',
    anneeScolaireId: 'a1',
    classe: { id: 'c1', nom: '5eme', niveau: { nom: '5eme' } },
    anneeScolaire: { id: 'a1', libelle: '2026-2027' },
  };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BulletinService(prisma);
    prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', nom: 'Camara', prenom: 'Laby' });
  });

  it("refuse un élève sans inscription en cours", async () => {
    prisma.inscription.findFirst.mockResolvedValue(null);
    await expect(service.calculer('ecole', 'e1', 1)).rejects.toThrow(BadRequestException);
  });

  it('calcule moyenne, mention, rang et effectif de la classe', async () => {
    prisma.inscription.findFirst.mockResolvedValue(inscription);
    prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }, { eleveId: 'e2' }, { eleveId: 'e3' }]);

    // notes par élève : e1 = 8 (coef 2) et 6 (coef 1) => 7.333 ; e2 = 9 ; e3 = 4
    const notesParEleve: Record<string, any[]> = {
      e1: [
        { valeur: 8, appreciation: 'bien', matiere: { nom: 'Math', coefficient: 2 } },
        { valeur: 6, appreciation: null, matiere: { nom: 'Français', coefficient: 1 } },
      ],
      e2: [{ valeur: 9, matiere: { nom: 'Math', coefficient: 1 } }],
      e3: [{ valeur: 4, matiere: { nom: 'Math', coefficient: 1 } }],
    };
    prisma.note.findMany.mockImplementation(async ({ where }: any) => notesParEleve[where.eleveId]);

    const r = await service.calculer('ecole', 'e1', 2);

    expect(r.trimestre).toBe(2);
    expect(r.moyenneGenerale).toBeCloseTo(7.3333, 3);
    expect(r.mention).toBe('Bien');
    expect(r.rang).toBe(2); // e2 (9) devant e1 (7.33) devant e3 (4)
    expect(r.effectifClasse).toBe(3);
    expect(r.notes).toHaveLength(2);
    expect(r.notes[0]).toMatchObject({ matiere: 'Math', coefficient: 2, valeur: 8 });
  });

  it("filtre les notes sur l'année de l'inscription et le trimestre demandé", async () => {
    prisma.inscription.findFirst.mockResolvedValue(inscription);
    prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }]);
    prisma.note.findMany.mockResolvedValue([]);

    await service.calculer('ecole', 'e1', 3);

    expect(prisma.note.findMany.mock.calls[0][0].where).toMatchObject({
      eleveId: 'e1',
      trimestre: 3,
      anneeScolaireId: 'a1',
    });
  });

  it("donne rang 1 et moyenne 0 à un élève sans note seul dans sa classe", async () => {
    prisma.inscription.findFirst.mockResolvedValue(inscription);
    prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }]);
    prisma.note.findMany.mockResolvedValue([]);

    const r = await service.calculer('ecole', 'e1', 1);
    expect(r.moyenneGenerale).toBe(0);
    expect(r.mention).toBe('Insuffisant');
    expect(r.rang).toBe(1);
  });
});
