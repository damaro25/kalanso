import { BadRequestException, NotFoundException } from '@nestjs/common';
import { BibliothequeService } from './bibliotheque.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('BibliothequeService', () => {
  let prisma: any;
  let service: BibliothequeService;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new BibliothequeService(prisma);
  });

  describe('findAllLivres', () => {
    it('calcule les exemplaires empruntés et disponibles par livre', async () => {
      prisma.livre.findMany.mockResolvedValue([
        { id: 'l1', titre: 'A', quantiteTotale: 3 },
        { id: 'l2', titre: 'B', quantiteTotale: 1 },
        { id: 'l3', titre: 'C', quantiteTotale: 2 },
      ]);
      prisma.emprunt.groupBy.mockResolvedValue([
        { livreId: 'l1', _count: { _all: 2 } },
        { livreId: 'l2', _count: { _all: 5 } }, // incohérence de données : jamais de disponibilité négative
      ]);

      const r = await service.findAllLivres('ecole');

      expect(r.map((l) => [l.id, l.quantiteEmpruntee, l.quantiteDisponible])).toEqual([
        ['l1', 2, 1],
        ['l2', 5, 0],
        ['l3', 0, 2],
      ]);
      expect(prisma.emprunt.groupBy.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', statut: 'EN_COURS' });
    });
  });

  describe('removeLivre', () => {
    beforeEach(() => {
      prisma.livre.findFirstOrThrow.mockResolvedValue({ id: 'l1' });
    });

    it('refuse de supprimer un livre dont des exemplaires sont encore empruntés', async () => {
      prisma.emprunt.count.mockResolvedValue(1);
      await expect(service.removeLivre('ecole', 'l1')).rejects.toThrow(BadRequestException);
      expect(prisma.livre.delete).not.toHaveBeenCalled();
      expect(prisma.emprunt.deleteMany).not.toHaveBeenCalled();
    });

    it("supprime l'historique des emprunts puis le livre, en une seule transaction", async () => {
      prisma.emprunt.count.mockResolvedValue(0);
      prisma.livre.delete.mockResolvedValue({ id: 'l1' });

      const r = await service.removeLivre('ecole', 'l1');

      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.emprunt.deleteMany).toHaveBeenCalledWith({ where: { livreId: 'l1' } });
      expect(prisma.livre.delete).toHaveBeenCalledWith({ where: { id: 'l1' } });
      expect(r).toEqual({ id: 'l1' });
    });
  });

  describe('emprunter', () => {
    const dto = { livreId: 'l1', eleveId: 'e1' } as any;

    beforeEach(() => {
      prisma.livre.findFirst.mockResolvedValue({ id: 'l1', quantiteTotale: 2 });
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
      prisma.emprunt.count.mockResolvedValue(0);
      prisma.emprunt.create.mockImplementation(async ({ data }: any) => ({ id: 'em1', ...data }));
    });

    it('404 si le livre est introuvable ou d\'une autre école', async () => {
      prisma.livre.findFirst.mockResolvedValue(null);
      await expect(service.emprunter('ecole', dto)).rejects.toThrow(NotFoundException);
      expect(prisma.livre.findFirst.mock.calls[0][0].where).toEqual({ id: 'l1', ecoleId: 'ecole' });
    });

    it("refuse quand tous les exemplaires sont empruntés", async () => {
      prisma.emprunt.count.mockResolvedValue(2);
      await expect(service.emprunter('ecole', dto)).rejects.toThrow('Aucun exemplaire disponible');
      expect(prisma.emprunt.create).not.toHaveBeenCalled();
    });

    it('accepte le dernier exemplaire disponible', async () => {
      prisma.emprunt.count.mockResolvedValue(1);
      await expect(service.emprunter('ecole', dto)).resolves.toBeDefined();
    });

    describe('date de retour prévue', () => {
      beforeEach(() => {
        jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval', 'queueMicrotask'] });
        jest.setSystemTime(new Date('2026-10-01T12:00:00Z'));
      });
      afterEach(() => jest.useRealTimers());

      it('par défaut, deux semaines après l\'emprunt', async () => {
        const e: any = await service.emprunter('ecole', dto);
        expect(e.dateRetourPrevue).toEqual(new Date('2026-10-15T12:00:00Z'));
      });

      it('utilise la date fournie', async () => {
        const e: any = await service.emprunter('ecole', { ...dto, dateRetourPrevue: '2026-10-08' });
        expect(e.dateRetourPrevue).toEqual(new Date('2026-10-08'));
      });
    });
  });

  describe('retourner', () => {
    it('404 si introuvable', async () => {
      prisma.emprunt.findFirst.mockResolvedValue(null);
      await expect(service.retourner('ecole', 'x')).rejects.toThrow(NotFoundException);
    });

    it('refuse un emprunt déjà retourné', async () => {
      prisma.emprunt.findFirst.mockResolvedValue({ id: 'em1', statut: 'RETOURNE' });
      await expect(service.retourner('ecole', 'em1')).rejects.toThrow('déjà retourné');
      expect(prisma.emprunt.update).not.toHaveBeenCalled();
    });

    it('marque RETOURNE avec la date effective', async () => {
      prisma.emprunt.findFirst.mockResolvedValue({ id: 'em1', statut: 'EN_COURS' });
      await service.retourner('ecole', 'em1');
      const arg = prisma.emprunt.update.mock.calls[0][0];
      expect(arg.where).toEqual({ id: 'em1' });
      expect(arg.data.statut).toBe('RETOURNE');
      expect(arg.data.dateRetourEffective).toBeInstanceOf(Date);
    });
  });

  describe('retards', () => {
    const passe = new Date(Date.now() - 24 * 3600 * 1000);
    const futur = new Date(Date.now() + 24 * 3600 * 1000);

    it("findEmprunts ne signale en retard que les emprunts EN_COURS dont l'échéance est dépassée", async () => {
      prisma.emprunt.findMany.mockResolvedValue([
        { id: 'a', statut: 'EN_COURS', dateRetourPrevue: passe },
        { id: 'b', statut: 'EN_COURS', dateRetourPrevue: futur },
        { id: 'c', statut: 'RETOURNE', dateRetourPrevue: passe },
      ]);
      const r = await service.findEmprunts('ecole');
      expect(r.map((e) => [e.id, e.enRetard])).toEqual([
        ['a', true],
        ['b', false],
        ['c', false],
      ]);
    });

    it('resume compte titres, exemplaires, emprunts en cours et retards', async () => {
      prisma.livre.count.mockResolvedValue(4);
      prisma.livre.aggregate.mockResolvedValue({ _sum: { quantiteTotale: 12 } });
      prisma.emprunt.findMany.mockResolvedValue([{ dateRetourPrevue: passe }, { dateRetourPrevue: futur }]);

      expect(await service.resume('ecole')).toEqual({ nbTitres: 4, totalExemplaires: 12, empruntsEnCours: 2, enRetard: 1 });
    });

    it('resume sans aucun livre renvoie 0 exemplaire (somme nulle)', async () => {
      prisma.livre.count.mockResolvedValue(0);
      prisma.livre.aggregate.mockResolvedValue({ _sum: { quantiteTotale: null } });
      prisma.emprunt.findMany.mockResolvedValue([]);
      expect((await service.resume('ecole')).totalExemplaires).toBe(0);
    });
  });
});
