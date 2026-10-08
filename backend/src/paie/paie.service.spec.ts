import * as ExcelJS from 'exceljs';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PaieService } from './paie.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('PaieService', () => {
  let prisma: any;
  let personnelService: { lignesBaseEnseignant: jest.Mock };
  let service: PaieService;

  beforeEach(() => {
    prisma = createPrismaMock();
    personnelService = { lignesBaseEnseignant: jest.fn() };
    service = new PaieService(prisma, personnelService as any);
    prisma.bulletinPaie.findUnique.mockResolvedValue(null);
    prisma.bulletinPaie.create.mockImplementation(async ({ data }: any) => ({ id: 'b1', ...data }));
  });

  describe('creerBulletin', () => {
    const dto = (over: Record<string, unknown> = {}) => ({ personnelId: 'p1', mois: 9, annee: 2026, ...over }) as any;

    it('404 si le personnel est introuvable ou d\'une autre école', async () => {
      prisma.personnel.findFirst.mockResolvedValue(null);
      await expect(service.creerBulletin('ecole', dto(), 'u1')).rejects.toThrow(NotFoundException);
      expect(prisma.personnel.findFirst.mock.calls[0][0].where).toEqual({ id: 'p1', ecoleId: 'ecole' });
    });

    it('refuse un second bulletin pour le même personnel et le même mois', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', salaireBase: 100000 });
      prisma.bulletinPaie.findUnique.mockResolvedValue({ id: 'existant' });
      await expect(service.creerBulletin('ecole', dto(), 'u1')).rejects.toThrow('existe déjà');
      expect(prisma.bulletinPaie.create).not.toHaveBeenCalled();
    });

    it('administratif : une ligne « Salaire de base » + lignes additionnelles, net = gains - retenues', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', salaireBase: 300000 });

      const b: any = await service.creerBulletin(
        'ecole',
        dto({
          modePaiement: 'Virement',
          lignes: [
            { libelle: 'Prime transport', montantGain: 50000 },
            { libelle: 'Avance', montantRetenue: 20000 },
          ],
        }),
        'u1',
      );

      expect(b).toMatchObject({
        ecoleId: 'ecole',
        personnelId: 'p1',
        mois: 9,
        annee: 2026,
        modePaiement: 'Virement',
        totalGains: 350000,
        totalRetenues: 20000,
        netAPayer: 330000,
        creeParId: 'u1',
      });
      expect(b.lignes.create.map((l: any) => [l.libelle, l.montantGain, l.montantRetenue, l.ordre, l.imposable])).toEqual([
        ['Salaire de base', 300000, 0, 0, true],
        ['Prime transport', 50000, 0, 1, false],
        ['Avance', 0, 20000, 2, false],
      ]);
    });

    it('enseignant : la base vient des lignes calculées par PersonnelService et fixe le nombre d\'heures', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ENSEIGNANT', salaireBase: null });
      personnelService.lignesBaseEnseignant.mockResolvedValue({
        lignes: [{ libelle: 'Salaire base — 6eme A Maths', heures: 8, taux: 5000, montant: 40000 }],
        totalHeures: 8,
        total: 40000,
      });

      const b: any = await service.creerBulletin(
        'ecole',
        dto({ nombreHeures: 999, heuresParClasse: [{ classeId: 'c1', matiereId: 'm1', heures: 8 }] }),
        'u1',
      );

      expect(personnelService.lignesBaseEnseignant).toHaveBeenCalledWith('ecole', 'p1', [
        { classeId: 'c1', matiereId: 'm1', heures: 8 },
      ]);
      expect(b.nombreHeures).toBe(8); // la valeur envoyée par le client est ignorée
      expect(b.netAPayer).toBe(40000);
    });

    it('refuse un bulletin sans aucun montant', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', salaireBase: null });
      await expect(service.creerBulletin('ecole', dto(), 'u1')).rejects.toThrow('Aucun montant');
      expect(prisma.bulletinPaie.create).not.toHaveBeenCalled();
    });

    it('refuse un net à payer négatif', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', salaireBase: 100000 });
      await expect(
        service.creerBulletin('ecole', dto({ lignes: [{ libelle: 'Saisie', montantRetenue: 150000 }] }), 'u1'),
      ).rejects.toThrow('négatif');
      expect(prisma.bulletinPaie.create).not.toHaveBeenCalled();
    });

    it('accepte un net à payer nul', async () => {
      prisma.personnel.findFirst.mockResolvedValue({ id: 'p1', type: 'ADMINISTRATIF', salaireBase: 100000 });
      const b: any = await service.creerBulletin('ecole', dto({ lignes: [{ libelle: 'Saisie', montantRetenue: 100000 }] }), 'u1');
      expect(b.netAPayer).toBe(0);
    });
  });

  describe('valider / supprimer (uniquement en brouillon)', () => {
    it.each(['valider', 'supprimer'] as const)('%s : 404 si le bulletin est introuvable', async (methode) => {
      prisma.bulletinPaie.findFirst.mockResolvedValue(null);
      await expect(service[methode]('ecole', 'b1')).rejects.toThrow(NotFoundException);
    });

    it.each(['valider', 'supprimer'] as const)('%s : refuse un bulletin déjà validé', async (methode) => {
      prisma.bulletinPaie.findFirst.mockResolvedValue({ id: 'b1', statut: 'VALIDE' });
      await expect(service[methode]('ecole', 'b1')).rejects.toThrow(BadRequestException);
      expect(prisma.bulletinPaie.update).not.toHaveBeenCalled();
      expect(prisma.bulletinPaie.delete).not.toHaveBeenCalled();
    });

    it('valider : passe un brouillon en VALIDE', async () => {
      prisma.bulletinPaie.findFirst.mockResolvedValue({ id: 'b1', statut: 'BROUILLON' });
      await service.valider('ecole', 'b1');
      expect(prisma.bulletinPaie.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { statut: 'VALIDE' } });
    });

    it('supprimer : supprime un brouillon', async () => {
      prisma.bulletinPaie.findFirst.mockResolvedValue({ id: 'b1', statut: 'BROUILLON' });
      await service.supprimer('ecole', 'b1');
      expect(prisma.bulletinPaie.delete).toHaveBeenCalledWith({ where: { id: 'b1' } });
    });
  });

  describe('lectures', () => {
    it('findOne : 404 hors école', async () => {
      prisma.bulletinPaie.findFirst.mockResolvedValue(null);
      await expect(service.findOne('ecole', 'x')).rejects.toThrow(NotFoundException);
      expect(prisma.bulletinPaie.findFirst.mock.calls[0][0].where).toEqual({ id: 'x', ecoleId: 'ecole' });
    });

    it('findByMois filtre par école, mois et année', async () => {
      prisma.bulletinPaie.findMany.mockResolvedValue([]);
      await service.findByMois('ecole', 9, 2026);
      expect(prisma.bulletinPaie.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', mois: 9, annee: 2026 });
    });
  });

  describe('importXlsx', () => {
    async function classeur(rows: any[][]): Promise<Buffer> {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Paie');
      rows.forEach((r) => ws.addRow(r));
      return Buffer.from(await wb.xlsx.writeBuffer());
    }

    const entete = ['Matricule', 'Mois', 'Année', 'Libellé', 'Montant gain', 'Montant retenue', 'Imposable', 'Mode de paiement'];

    beforeEach(() => {
      prisma.personnel.findMany.mockResolvedValue([
        { id: 'p1', matricule: 'A01', nom: 'Touré', prenom: 'Makalé' },
        { id: 'p2', matricule: null, nom: 'Bah', prenom: 'Aissatou' },
      ]);
      // creerBulletin s'appuie sur ces deux lectures
      prisma.personnel.findFirst.mockImplementation(async ({ where }: any) => ({
        id: where.id,
        type: 'ADMINISTRATIF',
        salaireBase: 100000,
      }));
    });

    it('refuse un fichier sans les colonnes obligatoires', async () => {
      const buf = await classeur([['Libellé', 'Montant gain'], ['Prime', 1000]]);
      await expect(service.importXlsx('ecole', buf, 'u1')).rejects.toThrow('Colonnes attendues');
    });

    it('regroupe les lignes d\'un même personnel/mois/année en un seul bulletin', async () => {
      const buf = await classeur([
        entete,
        ['A01', 9, 2026, 'Prime', 50000, 0, 'Oui', 'Billetage'],
        ['A01', 9, 2026, 'Avance', 0, 10000, 'Non', ''],
      ]);

      const r = await service.importXlsx('ecole', buf, 'u1');

      expect(r).toEqual({ creees: 1, erreurs: [] });
      expect(prisma.bulletinPaie.create).toHaveBeenCalledTimes(1);
      const data = prisma.bulletinPaie.create.mock.calls[0][0].data;
      expect(data).toMatchObject({ personnelId: 'p1', mois: 9, annee: 2026, modePaiement: 'Billetage', creeParId: 'u1' });
      expect(data.totalGains).toBe(150000); // 100 000 de base + 50 000 de prime
      expect(data.totalRetenues).toBe(10000);
      const prime = data.lignes.create.find((l: any) => l.libelle === 'Prime');
      expect(prime.imposable).toBe(true);
    });

    it('signale personnel introuvable et mois/année invalide, sans bloquer les autres lignes', async () => {
      const buf = await classeur([
        entete,
        ['INCONNU', 9, 2026, 'Prime', 1000, 0, '', ''],
        ['A01', 13, 2026, 'Prime', 1000, 0, '', ''],
        ['A01', 10, 2026, 'Prime', 1000, 0, '', ''],
      ]);

      const r = await service.importXlsx('ecole', buf, 'u1');

      expect(r.creees).toBe(1);
      expect(r.erreurs.map((e) => [e.ligne, e.motif])).toEqual([
        [2, 'Personnel introuvable (INCONNU)'],
        [3, 'Mois/Année invalide'],
      ]);
    });

    it('reporte l\'erreur d\'un bulletin refusé (déjà existant) sans bloquer les autres', async () => {
      prisma.bulletinPaie.findUnique.mockImplementation(async ({ where }: any) =>
        where.personnelId_mois_annee.personnelId === 'p1' ? { id: 'deja' } : null,
      );
      const buf = await classeur([
        entete,
        ['A01', 9, 2026, 'Prime', 1000, 0, '', ''],
        ['', '', '', 'Prime', 1000, 0, '', ''], // ni identité ni période : ligne parasite, ignorée
      ]);

      const r = await service.importXlsx('ecole', buf, 'u1');

      expect(r.creees).toBe(0);
      expect(r.erreurs).toEqual([{ ligne: 2, motif: 'Un bulletin existe déjà pour ce personnel sur ce mois' }]);
    });

    it('signale une ligne qui a une période mais aucune identité', async () => {
      const buf = await classeur([entete, ['', 9, 2026, 'Prime', 1000, 0, '', '']]);
      const r = await service.importXlsx('ecole', buf, 'u1');
      expect(r.creees).toBe(0);
      expect(r.erreurs).toHaveLength(1);
      expect(r.erreurs[0]).toMatchObject({ ligne: 2 });
      expect(r.erreurs[0].motif).toContain('Personnel introuvable');
    });
  });
});
