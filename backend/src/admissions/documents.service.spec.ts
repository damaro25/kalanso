import { existsSync } from 'fs';
import { join } from 'path';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService, DOSSIER_UPLOADS } from './documents.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), existsSync: jest.fn() }));
const existsSyncMock = existsSync as unknown as jest.Mock;

describe('DocumentsService', () => {
  let prisma: any;
  let service: DocumentsService;

  const fichier = { originalname: 'photo.jpg', filename: 'abc123.jpg', mimetype: 'image/jpeg', size: 2048 };

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new DocumentsService(prisma);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('ajouter (public, par le parent)', () => {
    it('404 si la demande est introuvable', async () => {
      prisma.demandeInscription.findUnique.mockResolvedValue(null);
      await expect(service.ajouter('d1', 'PHOTO', fichier)).rejects.toThrow(NotFoundException);
    });

    it('refuse l\'ajout sur une demande déjà traitée', async () => {
      prisma.demandeInscription.findUnique.mockResolvedValue({ id: 'd1', statut: 'ACCEPTEE' });
      await expect(service.ajouter('d1', 'PHOTO', fichier)).rejects.toThrow('déjà traitée');
      expect(prisma.documentDemande.create).not.toHaveBeenCalled();
    });

    it('refuse un type de document inconnu', async () => {
      prisma.demandeInscription.findUnique.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE' });
      await expect(service.ajouter('d1', 'VIRUS', fichier)).rejects.toThrow(BadRequestException);
      expect(prisma.documentDemande.create).not.toHaveBeenCalled();
    });

    it.each(['PHOTO', 'ATTESTATION', 'RELEVE_NOTES', 'EXTRAIT_NAISSANCE', 'AUTRE'])('accepte le type %s', async (type) => {
      prisma.demandeInscription.findUnique.mockResolvedValue({ id: 'd1', statut: 'EN_ATTENTE' });
      await service.ajouter('d1', type, fichier);
      expect(prisma.documentDemande.create.mock.calls[0][0].data).toEqual({
        demandeId: 'd1',
        type,
        nomFichier: 'photo.jpg',
        cheminFichier: 'abc123.jpg',
        mimeType: 'image/jpeg',
        tailleOctets: 2048,
      });
    });
  });

  describe('pourTelechargement', () => {
    it("cloisonne le document par l'école de la demande", async () => {
      prisma.documentDemande.findFirst.mockResolvedValue(null);
      await expect(service.pourTelechargement('ecole', 'doc1')).rejects.toThrow('Document introuvable');
      expect(prisma.documentDemande.findFirst.mock.calls[0][0].where).toEqual({ id: 'doc1', demande: { ecoleId: 'ecole' } });
    });

    it('404 si le fichier a disparu du disque', async () => {
      prisma.documentDemande.findFirst.mockResolvedValue({ id: 'doc1', cheminFichier: 'abc123.jpg' });
      existsSyncMock.mockReturnValue(false);
      await expect(service.pourTelechargement('ecole', 'doc1')).rejects.toThrow('Fichier introuvable');
    });

    it('renvoie le document et son chemin dans le dossier d\'uploads', async () => {
      const document = { id: 'doc1', cheminFichier: 'abc123.jpg' };
      prisma.documentDemande.findFirst.mockResolvedValue(document);
      existsSyncMock.mockReturnValue(true);
      const r = await service.pourTelechargement('ecole', 'doc1');
      expect(r).toEqual({ document, chemin: join(DOSSIER_UPLOADS, 'abc123.jpg') });
    });
  });

  describe('verifier', () => {
    it('404 si le document est introuvable ou d\'une autre école', async () => {
      prisma.documentDemande.findFirst.mockResolvedValue(null);
      await expect(service.verifier('ecole', 'doc1', 'VERIFIE', undefined, 'u1')).rejects.toThrow(NotFoundException);
    });

    it('refuse un statut autre que VERIFIE / REJETE', async () => {
      prisma.documentDemande.findFirst.mockResolvedValue({ id: 'doc1' });
      await expect(service.verifier('ecole', 'doc1', 'EN_ATTENTE', undefined, 'u1')).rejects.toThrow(BadRequestException);
      expect(prisma.documentDemande.update).not.toHaveBeenCalled();
    });

    it('enregistre le statut, le commentaire et le vérificateur', async () => {
      prisma.documentDemande.findFirst.mockResolvedValue({ id: 'doc1' });
      await service.verifier('ecole', 'doc1', 'REJETE', 'Photo floue', 'u1');
      expect(prisma.documentDemande.update).toHaveBeenCalledWith({
        where: { id: 'doc1' },
        data: { statut: 'REJETE', commentaire: 'Photo floue', verifieParId: 'u1' },
      });
    });
  });
});
