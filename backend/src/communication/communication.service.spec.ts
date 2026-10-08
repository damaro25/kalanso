import { BadRequestException, Logger } from '@nestjs/common';
import { CommunicationService } from './communication.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('CommunicationService', () => {
  let prisma: any;
  let sms: { envoyer: jest.Mock };
  let service: CommunicationService;

  const lien = (parentTuteurId: string, telephone: string | null) => ({ parentTuteurId, parentTuteur: { telephone } });

  beforeEach(() => {
    prisma = createPrismaMock();
    sms = { envoyer: jest.fn().mockResolvedValue(true) };
    service = new CommunicationService(prisma, sms as any);

    prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1' });
    prisma.eleveParent.findMany.mockResolvedValue([lien('pt1', '620000001'), lien('pt2', '620000002')]);
    prisma.messageParent.create.mockImplementation(async ({ data }: any) => ({ id: `m-${data.parentTuteurId}`, ...data }));
    prisma.messageParent.update.mockImplementation(async ({ where, data }: any) => ({ id: where.id, ...data }));
    // Le service journalise les échecs SMS : on évite le bruit dans la sortie des tests.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('envoyerMessageEleve', () => {
    it("refuse un élève d'une autre école", async () => {
      prisma.eleve.findFirstOrThrow.mockRejectedValue(new Error('not found'));
      await expect(service.envoyerMessageEleve('ecole', 'x', 'Bonjour', 'u1')).rejects.toThrow('not found');
      expect(sms.envoyer).not.toHaveBeenCalled();
    });

    it('envoie un SMS à chaque parent joignable et journalise chaque message avec son statut', async () => {
      const r = await service.envoyerMessageEleve('ecole', 'e1', 'Réunion demain', 'u1');

      expect(sms.envoyer).toHaveBeenCalledTimes(2);
      expect(sms.envoyer).toHaveBeenCalledWith('620000001', 'Réunion demain');
      expect(prisma.messageParent.create.mock.calls[0][0].data).toMatchObject({
        ecoleId: 'ecole',
        eleveId: 'e1',
        parentTuteurId: 'pt1',
        telephone: '620000001',
        contenu: 'Réunion demain',
        type: 'MANUEL',
        envoyeParId: 'u1',
      });
      expect(r.map((m: any) => m.statut)).toEqual(['ENVOYE', 'ENVOYE']);
    });

    it('ignore les parents sans téléphone', async () => {
      prisma.eleveParent.findMany.mockResolvedValue([lien('pt1', null), lien('pt2', '620000002')]);
      await service.envoyerMessageEleve('ecole', 'e1', 'Salut', 'u1');
      expect(sms.envoyer).toHaveBeenCalledTimes(1);
      expect(sms.envoyer).toHaveBeenCalledWith('620000002', 'Salut');
    });

    it('refuse quand aucun parent n\'a de téléphone', async () => {
      prisma.eleveParent.findMany.mockResolvedValue([lien('pt1', null)]);
      await expect(service.envoyerMessageEleve('ecole', 'e1', 'Salut', 'u1')).rejects.toThrow(BadRequestException);
      expect(prisma.messageParent.create).not.toHaveBeenCalled();
    });

    it('marque ECHEC quand le fournisseur SMS renvoie false', async () => {
      sms.envoyer.mockResolvedValue(false);
      const r = await service.envoyerMessageEleve('ecole', 'e1', 'Salut', 'u1');
      expect(r.map((m: any) => m.statut)).toEqual(['ECHEC', 'ECHEC']);
    });

    it("une exception du fournisseur SMS n'interrompt pas l'envoi aux autres parents", async () => {
      sms.envoyer.mockRejectedValueOnce(new Error('réseau')).mockResolvedValueOnce(true);
      const r = await service.envoyerMessageEleve('ecole', 'e1', 'Salut', 'u1');
      expect(r.map((m: any) => m.statut)).toEqual(['ECHEC', 'ENVOYE']);
    });
  });

  describe('envoyerMessageClasse', () => {
    it('compte les messages envoyés et les élèves sans contact', async () => {
      prisma.classe.findFirstOrThrow.mockResolvedValue({ id: 'c1' });
      prisma.inscription.findMany.mockResolvedValue([{ eleveId: 'e1' }, { eleveId: 'e2' }, { eleveId: 'e3' }]);
      prisma.eleveParent.findMany.mockImplementation(async ({ where }: any) =>
        where.eleveId === 'e2' ? [] : [lien(`pt-${where.eleveId}`, '620000001')],
      );

      const r = await service.envoyerMessageClasse('ecole', 'c1', 'Fête de fin d\'année', 'u1');

      expect(r).toEqual({ envoyes: 2, elevesSansContact: 1 });
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toEqual({ ecoleId: 'ecole', classeId: 'c1', statut: 'EN_COURS' });
    });
  });

  describe('notifierAbsence', () => {
    it("ne fait rien (silencieusement) si l'élève n'appartient pas à l'école", async () => {
      prisma.eleve.findFirst.mockResolvedValue(null);
      await service.notifierAbsence('ecole', 'x', new Date('2026-10-05T12:00:00Z'));
      expect(sms.envoyer).not.toHaveBeenCalled();
    });

    it("ne fait rien si l'élève n'a aucun parent joignable", async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1', nom: 'Diallo', prenom: 'Fatou' });
      prisma.eleveParent.findMany.mockResolvedValue([lien('pt1', null)]);
      await service.notifierAbsence('ecole', 'e1', new Date('2026-10-05T12:00:00Z'));
      expect(sms.envoyer).not.toHaveBeenCalled();
    });

    it('envoie un SMS de type ABSENCE avec le nom de l\'enfant et la date', async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1', nom: 'Diallo', prenom: 'Fatou' });
      await service.notifierAbsence('ecole', 'e1', new Date('2026-10-05T12:00:00Z'));
      const contenu: string = sms.envoyer.mock.calls[0][1];
      expect(contenu).toContain('Fatou Diallo');
      expect(contenu).toContain('05/10/2026');
      expect(prisma.messageParent.create.mock.calls[0][0].data.type).toBe('ABSENCE');
    });
  });

  describe('rappelImpaye', () => {
    const facture = (over: Record<string, unknown> = {}) => ({
      id: 'f1',
      eleveId: 'e1',
      libelle: 'Écolage T1',
      montantTotal: 500000,
      montantPaye: 200000,
      eleve: { prenom: 'Fatou', nom: 'Diallo' },
      ...over,
    });

    it('refuse une facture déjà soldée', async () => {
      prisma.facture.findFirstOrThrow.mockResolvedValue(facture({ montantPaye: 500000 }));
      await expect(service.rappelImpaye('ecole', 'f1', 'u1')).rejects.toThrow('déjà soldée');
      expect(sms.envoyer).not.toHaveBeenCalled();
    });

    it('refuse quand aucun parent n\'est joignable', async () => {
      prisma.facture.findFirstOrThrow.mockResolvedValue(facture());
      prisma.eleveParent.findMany.mockResolvedValue([]);
      await expect(service.rappelImpaye('ecole', 'f1', 'u1')).rejects.toThrow(BadRequestException);
    });

    it('envoie un rappel RAPPEL_IMPAYE mentionnant le reste à payer', async () => {
      prisma.facture.findFirstOrThrow.mockResolvedValue(facture());
      await service.rappelImpaye('ecole', 'f1', 'u1');
      const contenu: string = sms.envoyer.mock.calls[0][1];
      expect(contenu).toContain('Fatou Diallo');
      expect(contenu).toContain('Écolage T1');
      expect(contenu.replace(/[\s  ]/g, '')).toContain('300000GNF');
      expect(prisma.messageParent.create.mock.calls[0][0].data).toMatchObject({ type: 'RAPPEL_IMPAYE', envoyeParId: 'u1' });
    });
  });

  it('journal : 200 derniers messages de l\'école', async () => {
    prisma.messageParent.findMany.mockResolvedValue([]);
    await service.journal('ecole');
    const arg = prisma.messageParent.findMany.mock.calls[0][0];
    expect(arg.where).toEqual({ ecoleId: 'ecole' });
    expect(arg.take).toBe(200);
  });
});
