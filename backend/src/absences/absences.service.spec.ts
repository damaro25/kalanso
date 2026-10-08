import { BadRequestException } from '@nestjs/common';
import { AbsencesService } from './absences.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('AbsencesService', () => {
  let prisma: any;
  let communication: { notifierAbsence: jest.Mock };
  let service: AbsencesService;

  const appel = (entries: any[]) => ({ classeId: 'c1', date: '2026-10-05', entries }) as any;

  beforeEach(() => {
    prisma = createPrismaMock();
    communication = { notifierAbsence: jest.fn().mockResolvedValue(undefined) };
    service = new AbsencesService(prisma, communication as any);

    prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1', anneeScolaireId: 'a1' });
    prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }, { eleveId: 'e2' }, { eleveId: 'e3' }]);
    prisma.absence.findMany.mockResolvedValue([]);
    prisma.absence.upsert.mockImplementation((arg: any) => arg);
  });

  describe('enregistrerAppel', () => {
    it("refuse un élève qui n'est pas inscrit dans la classe, sans rien écrire ni notifier", async () => {
      await expect(
        service.enregistrerAppel(
          'ecole',
          appel([
            { eleveId: 'e1', statut: 'ABSENT' },
            { eleveId: 'e-transfere', statut: 'ABSENT' },
          ]),
          'u1',
        ),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.absence.upsert).not.toHaveBeenCalled();
      expect(communication.notifierAbsence).not.toHaveBeenCalled();
    });

    it("ne retient que les inscriptions EN_COURS de la classe pour l'année de la classe", async () => {
      await service.enregistrerAppel('ecole', appel([{ eleveId: 'e1', statut: 'PRESENT' }]), 'u1');
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({
        ecoleId: 'ecole',
        classeId: 'c1',
        anneeScolaireId: 'a1',
        statut: 'EN_COURS',
      });
    });

    it('upsert une absence par élève (clé élève + date), rattachée à la classe et à l\'année', async () => {
      await service.enregistrerAppel(
        'ecole',
        appel([
          { eleveId: 'e1', statut: 'ABSENT', motif: 'Maladie' },
          { eleveId: 'e2', statut: 'PRESENT' },
        ]),
        'u1',
      );

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.absence.upsert).toHaveBeenCalledTimes(2);
      const premier = prisma.absence.upsert.mock.calls[0][0];
      expect(premier.where).toEqual({ eleveId_date: { eleveId: 'e1', date: new Date('2026-10-05') } });
      expect(premier.update).toMatchObject({ statut: 'ABSENT', motif: 'Maladie', saisieParId: 'u1', classeId: 'c1', anneeScolaireId: 'a1' });
      expect(premier.create).toMatchObject({ ecoleId: 'ecole', eleveId: 'e1', classeId: 'c1', anneeScolaireId: 'a1', saisieParId: 'u1' });
    });

    it('notifie les parents des seuls élèves ABSENT (pas les retards ni les présents)', async () => {
      await service.enregistrerAppel(
        'ecole',
        appel([
          { eleveId: 'e1', statut: 'ABSENT' },
          { eleveId: 'e2', statut: 'RETARD' },
          { eleveId: 'e3', statut: 'PRESENT' },
        ]),
        'u1',
      );
      expect(communication.notifierAbsence).toHaveBeenCalledTimes(1);
      expect(communication.notifierAbsence).toHaveBeenCalledWith('ecole', 'e1', new Date('2026-10-05'));
    });

    it("ne renotifie pas un élève déjà marqué absent à cette date (appel re-soumis)", async () => {
      prisma.absence.findMany.mockResolvedValue([{ eleveId: 'e1', statut: 'ABSENT' }]);

      await service.enregistrerAppel(
        'ecole',
        appel([
          { eleveId: 'e1', statut: 'ABSENT' },
          { eleveId: 'e2', statut: 'ABSENT' },
        ]),
        'u1',
      );

      expect(communication.notifierAbsence).toHaveBeenCalledTimes(1);
      expect(communication.notifierAbsence.mock.calls[0][1]).toBe('e2');
    });

    it('notifie un élève passé de RETARD à ABSENT', async () => {
      prisma.absence.findMany.mockResolvedValue([{ eleveId: 'e1', statut: 'RETARD' }]);
      await service.enregistrerAppel('ecole', appel([{ eleveId: 'e1', statut: 'ABSENT' }]), 'u1');
      expect(communication.notifierAbsence).toHaveBeenCalledTimes(1);
    });

    it("n'envoie aucune notification si l'écriture échoue", async () => {
      prisma.$transaction.mockRejectedValueOnce(new Error('db'));
      await expect(service.enregistrerAppel('ecole', appel([{ eleveId: 'e1', statut: 'ABSENT' }]), 'u1')).rejects.toThrow('db');
      expect(communication.notifierAbsence).not.toHaveBeenCalled();
    });
  });

  describe('lectures', () => {
    it("findByClasseAndDate vérifie la classe puis filtre par date", async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      await service.findByClasseAndDate('ecole', 'c1', '2026-10-05');
      expect(prisma.classe.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'c1', ecoleId: 'ecole' });
      expect(prisma.absence.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        classeId: 'c1',
        date: new Date('2026-10-05'),
      });
    });

    it("findByEleve vérifie l'élève puis trie du plus récent au plus ancien", async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      await service.findByEleve('ecole', 'e1');
      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'e1', ecoleId: 'ecole' });
      expect(prisma.absence.findMany.mock.calls[0][0].orderBy).toEqual({ date: 'desc' });
    });
  });

  describe('stats', () => {
    it('agrège absences et retards par élève, en ignorant les présences', async () => {
      prisma.absence.findMany.mockResolvedValue([
        { eleveId: 'e1', statut: 'ABSENT', eleve: { nom: 'Diallo', prenom: 'Fatou' } },
        { eleveId: 'e1', statut: 'ABSENT', eleve: { nom: 'Diallo', prenom: 'Fatou' } },
        { eleveId: 'e1', statut: 'RETARD', eleve: { nom: 'Diallo', prenom: 'Fatou' } },
        { eleveId: 'e2', statut: 'RETARD', eleve: { nom: 'Bah', prenom: 'Moussa' } },
      ]);

      const r = await service.stats('ecole', 'c1');

      expect(prisma.absence.findMany.mock.calls[0][0].where).toEqual({
        ecoleId: 'ecole',
        classeId: 'c1',
        statut: { in: ['ABSENT', 'RETARD'] },
      });
      expect(r).toEqual([
        { eleveId: 'e1', nom: 'Diallo', prenom: 'Fatou', absences: 2, retards: 1 },
        { eleveId: 'e2', nom: 'Bah', prenom: 'Moussa', absences: 0, retards: 1 },
      ]);
    });

    it('renvoie une liste vide sans absence', async () => {
      prisma.absence.findMany.mockResolvedValue([]);
      expect(await service.stats('ecole')).toEqual([]);
    });
  });
});
