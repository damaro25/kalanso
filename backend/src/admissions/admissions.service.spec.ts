import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdmissionsService } from './admissions.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

describe('AdmissionsService', () => {
  let prisma: any;
  let factures: { genererFacturesEnrolement: jest.Mock };
  let service: AdmissionsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    factures = { genererFacturesEnrolement: jest.fn().mockResolvedValue(undefined) };
    service = new AdmissionsService(prisma, factures as any);
  });

  const demandeBase = {
    ecoleId: 'ecole',
    nomEleve: 'Camara',
    prenomEleve: 'Mohamed',
    genre: 'M',
    dateNaissance: new Date('2015-01-01'),
    lieuNaissance: 'Conakry',
    nomParent: 'Camara',
    prenomParent: 'Kalilou',
    telephoneParent: '620000000',
    emailParent: 'k@x.gn',
  };

  describe('creerDemande (formulaire public)', () => {
    const dto = {
      ecoleId: 'ecole',
      nomEleve: 'Camara',
      prenomEleve: 'Mohamed',
      genre: 'M',
      dateNaissance: '2015-01-01',
      nomParent: 'Camara',
      prenomParent: 'Kalilou',
      telephoneParent: '620000000',
    } as any;

    it("refuse une école inconnue ou inactive", async () => {
      prisma.ecole.findFirst.mockResolvedValue(null);
      await expect(service.creerDemande(dto)).rejects.toThrow(NotFoundException);
      expect(prisma.ecole.findFirst.mock.calls[0][0].where).toEqual({ id: 'ecole', actif: true });
    });

    it("refuse un niveau qui n'appartient pas à cette école", async () => {
      prisma.ecole.findFirst.mockResolvedValue({ id: 'ecole' });
      prisma.niveau.findFirst.mockResolvedValue(null);
      await expect(service.creerDemande({ ...dto, niveauId: 'n-etranger' })).rejects.toThrow(BadRequestException);
      expect(prisma.demandeInscription.create).not.toHaveBeenCalled();
    });

    it('crée une demande (statut par défaut EN_ATTENTE) avec la date de naissance convertie', async () => {
      prisma.ecole.findFirst.mockResolvedValue({ id: 'ecole' });
      prisma.demandeInscription.create.mockImplementation(async ({ data }: any) => data);

      const r = await service.creerDemande(dto);

      expect(r.nomEleve).toBe('Camara');
      expect(r.dateNaissance).toEqual(new Date('2015-01-01'));
      expect(r.statut).toBeUndefined();
    });
  });

  describe('ecolePublique', () => {
    it("n'expose que des informations non sensibles et les niveaux triés par ordre", async () => {
      prisma.ecole.findFirst.mockResolvedValue({ id: 'ecole', nom: 'École X', ville: 'Conakry' });
      prisma.niveau.findMany.mockResolvedValue([{ id: 'n1', nom: 'CP1' }]);

      const r = await service.ecolePublique('ecole');

      expect(r).toEqual({ id: 'ecole', nom: 'École X', ville: 'Conakry', niveaux: [{ id: 'n1', nom: 'CP1' }] });
      expect(prisma.ecole.findFirst.mock.calls[0][0].select).toEqual({ id: true, nom: true, ville: true });
      expect(prisma.niveau.findMany.mock.calls[0][0].orderBy).toEqual({ ordre: 'asc' });
    });

    it('404 pour une école inconnue', async () => {
      prisma.ecole.findFirst.mockResolvedValue(null);
      await expect(service.ecolePublique('x')).rejects.toThrow(NotFoundException);
    });
  });

  describe('accepter', () => {
    beforeEach(() => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE', ...demandeBase });
      prisma.classe.findFirst.mockResolvedValue({ id: 'c1', anneeScolaireId: 'a-classe' });
      prisma.eleve.create.mockResolvedValue({ id: 'e-new' });
      prisma.parentTuteur.create.mockResolvedValue({ id: 'p-new' });
      prisma.demandeInscription.update.mockImplementation(async ({ data }: any) => ({ id: 'd1', ...data }));
    });

    it("404 si la demande n'existe pas dans cette école", async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue(null);
      await expect(service.accepter('ecole', 'd1', { classeId: 'c1' } as any, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('refuse une demande déjà traitée', async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'ACCEPTEE' });
      await expect(service.accepter('ecole', 'd1', { classeId: 'c1' } as any, 'u1')).rejects.toThrow('déjà été traitée');
      expect(prisma.eleve.create).not.toHaveBeenCalled();
    });

    it("refuse une classe qui n'appartient pas à l'école", async () => {
      prisma.classe.findFirst.mockResolvedValue(null);
      await expect(service.accepter('ecole', 'd1', { classeId: 'x' } as any, 'u1')).rejects.toThrow('Classe invalide');
      expect(prisma.eleve.create).not.toHaveBeenCalled();
    });

    it("crée élève + parent + lien + inscription (année de la classe) en transaction, marque la demande ACCEPTEE", async () => {
      const r = await service.accepter('ecole', 'd1', { classeId: 'c1', matricule: 'M42' } as any, 'u-traite');

      expect(prisma.eleve.create.mock.calls[0][0].data).toMatchObject({
        ecoleId: 'ecole',
        matricule: 'M42',
        nom: 'Camara',
        prenom: 'Mohamed',
      });
      expect(prisma.parentTuteur.create.mock.calls[0][0].data).toMatchObject({ nom: 'Camara', prenom: 'Kalilou', telephone: '620000000' });
      expect(prisma.eleveParent.create.mock.calls[0][0].data).toEqual({
        eleveId: 'e-new',
        parentTuteurId: 'p-new',
        lien: 'Parent',
        contactPrincipal: true,
      });
      expect(prisma.inscription.create.mock.calls[0][0].data).toMatchObject({
        eleveId: 'e-new',
        classeId: 'c1',
        anneeScolaireId: 'a-classe',
      });
      expect(prisma.demandeInscription.update.mock.calls[0][0].data).toEqual({
        statut: 'ACCEPTEE',
        eleveId: 'e-new',
        traiteeParId: 'u-traite',
      });
      expect(r.eleve).toEqual({ id: 'e-new' });
    });

    it("génère les factures d'enrôlement après la transaction, pour la classe et son année", async () => {
      await service.accepter('ecole', 'd1', { classeId: 'c1' } as any, 'u1');
      expect(factures.genererFacturesEnrolement).toHaveBeenCalledWith('ecole', 'e-new', 'c1', 'a-classe');
    });
  });

  describe('refuser / annulerRefus', () => {
    it('refuse une demande en attente avec un motif', async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE' });
      await service.refuser('ecole', 'd1', { motifRefus: 'Dossier incomplet' } as any, 'u1');
      expect(prisma.demandeInscription.update.mock.calls[0][0].data).toEqual({
        statut: 'REFUSEE',
        motifRefus: 'Dossier incomplet',
        traiteeParId: 'u1',
      });
    });

    it("ne peut pas refuser une demande déjà traitée ni inconnue", async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'ACCEPTEE' });
      await expect(service.refuser('ecole', 'd1', {} as any, 'u1')).rejects.toThrow(BadRequestException);
      prisma.demandeInscription.findFirst.mockResolvedValue(null);
      await expect(service.refuser('ecole', 'd1', {} as any, 'u1')).rejects.toThrow(NotFoundException);
    });

    it("annulerRefus : remet en attente et trace l'annulation (sans perte de données)", async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({
        id: 'd1',
        statut: 'REFUSEE',
        nomEleve: 'C',
        prenomEleve: 'M',
        motifRefus: 'Trop tard',
      });
      prisma.demandeInscription.update.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE' });

      await service.annulerRefus('ecole', 'd1', 'u1');

      expect(prisma.demandeInscription.update.mock.calls[0][0].data).toEqual({
        statut: 'EN_ATTENTE',
        motifRefus: null,
        traiteeParId: null,
      });
      expect(prisma.annulationAdmission.create.mock.calls[0][0].data).toMatchObject({
        type: 'REFUS',
        detail: 'Motif du refus annulé : Trop tard',
        annuleeParId: 'u1',
      });
    });

    it("annulerRefus : refuse une demande qui n'a pas été refusée", async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE' });
      await expect(service.annulerRefus('ecole', 'd1', 'u1')).rejects.toThrow("n'a pas été refusée");
    });
  });

  describe('annuler (une admission acceptée)', () => {
    it("refuse si la demande n'est pas à l'état ACCEPTEE", async () => {
      prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE', eleveId: null });
      await expect(service.annuler('ecole', 'd1', 'u1')).rejects.toThrow("n'a pas été acceptée");
    });

    describe('suppression en cascade', () => {
      beforeEach(() => {
        prisma.demandeInscription.findFirst.mockResolvedValue({
          id: 'd1',
          statut: 'ACCEPTEE',
          eleveId: 'e1',
          nomEleve: 'Camara',
          prenomEleve: 'Mohamed',
        });
        prisma.eleveParent.findMany.mockResolvedValue([{ parentTuteurId: 'p-seul' }, { parentTuteurId: 'p-fratrie' }]);
        prisma.facture.count.mockResolvedValue(2);
        prisma.note.count.mockResolvedValue(5);
        prisma.absence.count.mockResolvedValue(1);
        prisma.emprunt.count.mockResolvedValue(0);
        // p-seul n'est lié qu'à cet élève ; p-fratrie l'est aussi à un frère/une sœur
        prisma.eleveParent.findFirst.mockImplementation(async ({ where }: any) =>
          where.parentTuteurId === 'p-fratrie' ? { id: 'lien-autre' } : null,
        );
      });

      it("supprime l'élève et tout ce qui en dépend, remet la demande en attente et journalise le décompte", async () => {
        const r = await service.annuler('ecole', 'd1', 'u1');

        expect(r).toEqual({ annulee: true });
        expect(prisma.paiement.deleteMany).toHaveBeenCalledWith({ where: { facture: { eleveId: 'e1' } } });
        expect(prisma.facture.deleteMany).toHaveBeenCalledWith({ where: { eleveId: 'e1' } });
        expect(prisma.note.deleteMany).toHaveBeenCalledWith({ where: { eleveId: 'e1' } });
        expect(prisma.absence.deleteMany).toHaveBeenCalledWith({ where: { eleveId: 'e1' } });
        expect(prisma.inscription.deleteMany).toHaveBeenCalledWith({ where: { eleveId: 'e1' } });
        expect(prisma.eleve.delete).toHaveBeenCalledWith({ where: { id: 'e1' } });
        expect(prisma.demandeInscription.update.mock.calls[0][0].data).toEqual({
          statut: 'EN_ATTENTE',
          eleveId: null,
          motifRefus: null,
          traiteeParId: null,
        });
        expect(prisma.annulationAdmission.create.mock.calls[0][0].data).toMatchObject({
          type: 'ADMISSION',
          detail: '2 facture(s), 5 note(s), 1 absence(s), 0 emprunt(s) supprimés',
        });
      });

      it("supprime le parent propre à cet élève mais conserve celui qui est partagé avec la fratrie", async () => {
        await service.annuler('ecole', 'd1', 'u1');
        expect(prisma.parentTuteur.delete).toHaveBeenCalledTimes(1);
        expect(prisma.parentTuteur.delete).toHaveBeenCalledWith({ where: { id: 'p-seul' } });
      });

      it("les paiements sont supprimés avant les factures (contrainte d'intégrité)", async () => {
        await service.annuler('ecole', 'd1', 'u1');
        expect(prisma.paiement.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.facture.deleteMany.mock.invocationCallOrder[0],
        );
        expect(prisma.facture.deleteMany.mock.invocationCallOrder[0]).toBeLessThan(
          prisma.eleve.delete.mock.invocationCallOrder[0],
        );
      });
    });
  });

  describe('inscrireSurPlace', () => {
    it("crée une demande EN_ATTENTE (l'élève n'existe qu'après acceptation)", async () => {
      prisma.demandeInscription.create.mockImplementation(async ({ data }: any) => data);
      const r = await service.inscrireSurPlace('ecole', { ...demandeBase, dateNaissance: '2015-01-01' } as any);
      expect(r.ecoleId).toBe('ecole');
      expect(prisma.eleve.create).not.toHaveBeenCalled();
    });
  });

  describe('historiqueAnnulations', () => {
    it("liste les annulations de l'école, les plus récentes d'abord", async () => {
      prisma.annulationAdmission.findMany.mockResolvedValue([]);
      await service.historiqueAnnulations('ecole');
      expect(prisma.annulationAdmission.findMany.mock.calls[0][0]).toEqual({
        where: { ecoleId: 'ecole' },
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
