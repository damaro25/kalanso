import { BadRequestException, NotFoundException } from '@nestjs/common';
import { join } from 'path';
import { createPrismaMock } from '../../test/helpers/prisma-mock';
import { DOSSIER_UPLOADS } from '../admissions/documents.service';
import { genererPlancheCartesPdf } from './carte-pdf.util';
import { CartesScolairesService, mimeDepuisContenu } from './cartes-scolaires.service';
import { DOSSIER_PHOTOS, TAILLE_MAX_PHOTO } from './photo-upload.config';

jest.mock('./carte-pdf.util', () => ({ genererPlancheCartesPdf: jest.fn() }));

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const annee = { id: 'a1', libelle: '2026-2027' };

describe('mimeDepuisContenu', () => {
  it('reconnaît JPEG et PNG d\'après les octets, pas d\'après le nom', () => {
    expect(mimeDepuisContenu(JPEG)).toBe('image/jpeg');
    expect(mimeDepuisContenu(PNG)).toBe('image/png');
    expect(mimeDepuisContenu(Buffer.from('GIF89a'))).toBeNull();
    expect(mimeDepuisContenu(Buffer.from('%PDF-1.4'))).toBeNull();
    expect(mimeDepuisContenu(Buffer.alloc(0))).toBeNull();
  });
});

describe('CartesScolairesService', () => {
  let prisma: any;
  let service: CartesScolairesService;
  let tailleFichier: jest.Mock;
  let lireFichier: jest.Mock;
  let supprimerFichier: jest.Mock;

  beforeEach(() => {
    prisma = createPrismaMock();
    service = new CartesScolairesService(prisma);
    tailleFichier = jest.fn().mockResolvedValue(null);
    lireFichier = jest.fn().mockResolvedValue(null);
    supprimerFichier = jest.fn().mockResolvedValue(undefined);
    service.tailleFichier = tailleFichier;
    service.lireFichier = lireFichier;
    service.supprimerFichier = supprimerFichier;

    prisma.anneeScolaire.findFirst.mockResolvedValue(annee);
    prisma.documentDemande.findMany.mockResolvedValue([]);
    prisma.ecole.findUniqueOrThrow.mockResolvedValue({ id: 'ecole', nom: 'École' });
    (genererPlancheCartesPdf as jest.Mock).mockReset().mockResolvedValue(Buffer.from('%PDF-fake'));
  });

  describe('photo : fiche puis admission', () => {
    it("utilise d'abord la photo de la fiche, sans interroger les documents d'admission", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: 'abc.png' });
      tailleFichier.mockResolvedValue(1234);
      lireFichier.mockResolvedValue(PNG);

      const r = await service.lirePhotoEleve('ecole', 'e1');

      expect(r.mime).toBe('image/png');
      expect(lireFichier).toHaveBeenCalledWith(join(DOSSIER_PHOTOS, 'abc.png'));
      expect(prisma.documentDemande.findMany).not.toHaveBeenCalled();
    });

    it("à défaut, prend la photo d'admission la plus récente et ignore les documents rejetés ou non images", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: null });
      prisma.documentDemande.findMany.mockResolvedValue([
        { cheminFichier: 'recente.jpg', mimeType: 'image/jpeg', demande: { eleveId: 'e1' } },
        { cheminFichier: 'ancienne.jpg', mimeType: 'image/jpeg', demande: { eleveId: 'e1' } },
      ]);
      tailleFichier.mockResolvedValue(50_000);
      lireFichier.mockResolvedValue(JPEG);

      const r = await service.lirePhotoEleve('ecole', 'e1');

      expect(r.mime).toBe('image/jpeg');
      expect(lireFichier).toHaveBeenCalledWith(join(DOSSIER_UPLOADS, 'recente.jpg'));
      const where = prisma.documentDemande.findMany.mock.calls[0][0].where;
      expect(where).toEqual({
        type: 'PHOTO',
        statut: { not: 'REJETE' },
        mimeType: { in: ['image/jpeg', 'image/png'] },
        demande: { ecoleId: 'ecole', eleveId: { in: ['e1'] } },
      });
    });

    it('retombe sur la photo d\'admission quand le fichier de la fiche a disparu du disque', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: 'disparue.jpg' });
      prisma.documentDemande.findMany.mockResolvedValue([{ cheminFichier: 'adm.png', mimeType: 'image/png', demande: { eleveId: 'e1' } }]);
      tailleFichier.mockImplementation(async (chemin: string) => (chemin.endsWith('adm.png') ? 900 : null));
      lireFichier.mockResolvedValue(PNG);

      await service.lirePhotoEleve('ecole', 'e1');

      expect(lireFichier).toHaveBeenCalledWith(join(DOSSIER_UPLOADS, 'adm.png'));
    });

    it("n'utilise pas une photo d'admission plus lourde que la limite", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: null });
      prisma.documentDemande.findMany.mockResolvedValue([{ cheminFichier: 'gros.jpg', mimeType: 'image/jpeg', demande: { eleveId: 'e1' } }]);
      tailleFichier.mockResolvedValue(TAILLE_MAX_PHOTO + 1);

      await expect(service.lirePhotoEleve('ecole', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    });

    it("refuse la lecture d'un élève d'une autre école", async () => {
      prisma.eleve.findFirstOrThrow.mockRejectedValue(new Error('not found'));
      await expect(service.lirePhotoEleve('ecole', 'autre')).rejects.toThrow('not found');
      expect(prisma.eleve.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'autre', ecoleId: 'ecole' });
    });

    it('neutralise un nom de fichier piégé (../) en ne gardant que le nom', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: '../../.env' });
      tailleFichier.mockResolvedValue(10);
      lireFichier.mockResolvedValue(JPEG);

      await service.lirePhotoEleve('ecole', 'e1');

      expect(tailleFichier).toHaveBeenCalledWith(join(DOSSIER_PHOTOS, '.env'));
    });

    it("renvoie 404 quand l'élève n'a aucune photo", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: null });
      await expect(service.lirePhotoEleve('ecole', 'e1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('televerserPhoto', () => {
    const fichier = (mimetype = 'image/jpeg') => ({ filename: 'nouvelle.jpg', path: '/tmp/nouvelle.jpg', mimetype });

    it('enregistre la photo, la rattache à l\'élève et supprime l\'ancienne', async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1', photoUrl: 'ancienne.jpg' });
      lireFichier.mockResolvedValue(JPEG);

      const r = await service.televerserPhoto('ecole', 'e1', fichier());

      expect(r).toEqual({ photo: 'ELEVE' });
      expect(prisma.eleve.findFirst.mock.calls[0][0].where).toEqual({ id: 'e1', ecoleId: 'ecole' });
      expect(prisma.eleve.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { photoUrl: 'nouvelle.jpg' } });
      expect(supprimerFichier).toHaveBeenCalledWith(join(DOSSIER_PHOTOS, 'ancienne.jpg'));
    });

    it("supprime le fichier reçu quand l'élève n'existe pas dans l'école", async () => {
      prisma.eleve.findFirst.mockResolvedValue(null);
      await expect(service.televerserPhoto('ecole', 'e1', fichier())).rejects.toBeInstanceOf(NotFoundException);
      expect(supprimerFichier).toHaveBeenCalledWith('/tmp/nouvelle.jpg');
      expect(prisma.eleve.update).not.toHaveBeenCalled();
    });

    it("rejette un fichier dont le contenu n'est pas l'image annoncée", async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1', photoUrl: null });
      lireFichier.mockResolvedValue(Buffer.from('<?php echo 1; ?>'));
      await expect(service.televerserPhoto('ecole', 'e1', fichier())).rejects.toBeInstanceOf(BadRequestException);
      expect(supprimerFichier).toHaveBeenCalledWith('/tmp/nouvelle.jpg');
      expect(prisma.eleve.update).not.toHaveBeenCalled();
    });

    it('rejette un PNG déclaré en JPEG', async () => {
      prisma.eleve.findFirst.mockResolvedValue({ id: 'e1', photoUrl: null });
      lireFichier.mockResolvedValue(PNG);
      await expect(service.televerserPhoto('ecole', 'e1', fichier('image/jpeg'))).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('supprimerPhoto', () => {
    it("ne fait rien quand la fiche n'a pas de photo propre", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: null });
      expect(await service.supprimerPhoto('ecole', 'e1')).toEqual({ supprimee: false });
      expect(prisma.eleve.update).not.toHaveBeenCalled();
    });

    it('vide le champ et supprime le fichier', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', photoUrl: 'p.jpg' });
      expect(await service.supprimerPhoto('ecole', 'e1')).toEqual({ supprimee: true });
      expect(prisma.eleve.update).toHaveBeenCalledWith({ where: { id: 'e1' }, data: { photoUrl: null } });
      expect(supprimerFichier).toHaveBeenCalledWith(join(DOSSIER_PHOTOS, 'p.jpg'));
    });
  });

  describe('infoEleve', () => {
    const eleve = (inscriptions: any[]) => ({ id: 'e1', nom: 'Camara', prenom: 'Laby', matricule: '2026-001', photoUrl: null, inscriptions });

    it('indique la classe de l\'année courante et autorise la génération', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue(eleve([{ classe: { id: 'c1', nom: 'CP1 A', niveau: { nom: 'CP1' } } }]));
      const r = await service.infoEleve('ecole', 'e1');
      expect(r).toMatchObject({ nomComplet: 'Laby Camara', classe: { id: 'c1', nom: 'CP1 A', niveau: 'CP1' }, peutGenerer: true, photo: null });
      const include = prisma.eleve.findFirstOrThrow.mock.calls[0][0].include.inscriptions;
      expect(include.where).toEqual({ anneeScolaireId: 'a1', statut: 'EN_COURS' });
    });

    it("n'autorise pas la génération pour un élève sans classe cette année", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue(eleve([]));
      const r = await service.infoEleve('ecole', 'e1');
      expect(r.peutGenerer).toBe(false);
      expect(r.classe).toBeNull();
    });
  });

  describe('classe', () => {
    const classe = { id: 'c1', nom: 'CP1 A', anneeScolaireId: 'a1', niveau: { nom: 'CP1' }, anneeScolaire: annee };
    const inscrits = [
      { eleve: { id: 'e2', nom: 'Diallo', prenom: 'Aissatou', matricule: '2026-002', photoUrl: null, dateNaissance: null, lieuNaissance: null } },
      { eleve: { id: 'e1', nom: 'Camara', prenom: 'Laby', matricule: null, photoUrl: 'p.jpg', dateNaissance: new Date('2012-03-05'), lieuNaissance: 'Conakry' } },
    ];

    beforeEach(() => {
      prisma.classe.findFirstOrThrow.mockResolvedValue(classe);
      prisma.inscription.findMany.mockResolvedValue(inscrits);
    });

    it("liste les élèves inscrits dans l'ordre alphabétique avec leur état de photo", async () => {
      tailleFichier.mockImplementation(async (c: string) => (c.endsWith('p.jpg') ? 100 : null));

      const r = await service.apercuClasse('ecole', 'c1');

      expect(r.classe).toEqual({ id: 'c1', nom: 'CP1 A', niveau: 'CP1' });
      expect(r.eleves.map((e: any) => e.nomComplet)).toEqual(['Laby Camara', 'Aissatou Diallo']);
      expect(r.eleves.map((e: any) => e.photo)).toEqual(['ELEVE', null]);
      expect(r.resume).toEqual({ eleves: 2, sansPhoto: 1 });
      expect(prisma.classe.findFirstOrThrow.mock.calls[0][0].where).toEqual({ id: 'c1', ecoleId: 'ecole' });
      expect(prisma.inscription.findMany.mock.calls[0][0].where).toMatchObject({
        ecoleId: 'ecole',
        classeId: 'c1',
        anneeScolaireId: 'a1',
        statut: 'EN_COURS',
        eleve: { actif: true },
      });
    });

    it('génère les cartes de la classe avec photo, classe, niveau et QR du matricule (ou de l\'id)', async () => {
      tailleFichier.mockImplementation(async (c: string) => (c.endsWith('p.jpg') ? 100 : null));
      lireFichier.mockResolvedValue(JPEG);

      const r = await service.pdfClasse('ecole', 'c1');

      expect(r.nomFichier).toBe('cartes-scolaires-cp1-a.pdf');
      expect(r.pdf.subarray(0, 4).toString()).toBe('%PDF');
      const [ecole, libelle, cartes] = (genererPlancheCartesPdf as jest.Mock).mock.calls[0];
      expect(ecole).toMatchObject({ nom: 'École' });
      expect(libelle).toBe('2026-2027');
      expect(cartes).toHaveLength(2);
      expect(cartes[0]).toMatchObject({ nom: 'Camara', classe: 'CP1 A', niveau: 'CP1', codeQr: 'e1', photo: JPEG });
      expect(cartes[1]).toMatchObject({ nom: 'Diallo', codeQr: '2026-002', photo: null });
    });

    it("refuse de générer pour une classe sans élève", async () => {
      prisma.inscription.findMany.mockResolvedValue([]);
      await expect(service.pdfClasse('ecole', 'c1')).rejects.toBeInstanceOf(BadRequestException);
      expect(genererPlancheCartesPdf).not.toHaveBeenCalled();
    });
  });

  describe('pdfEleve', () => {
    it('génère la carte de l\'élève inscrit cette année', async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({
        id: 'e1',
        nom: 'Camara',
        prenom: 'Laby',
        matricule: '2026-001',
        photoUrl: null,
        dateNaissance: null,
        lieuNaissance: null,
        inscriptions: [{ classe: { id: 'c1', nom: 'CP1 A', niveau: { nom: 'CP1' } } }],
      });

      const r = await service.pdfEleve('ecole', 'e1');

      expect(r.nomFichier).toBe('carte-scolaire-laby-camara.pdf');
      const cartes = (genererPlancheCartesPdf as jest.Mock).mock.calls[0][2];
      expect(cartes).toHaveLength(1);
      expect(cartes[0]).toMatchObject({ classe: 'CP1 A', niveau: 'CP1', codeQr: '2026-001' });
    });

    it("refuse un élève sans classe cette année, avec un message qui dit quoi faire", async () => {
      prisma.eleve.findFirstOrThrow.mockResolvedValue({ id: 'e1', nom: 'C', prenom: 'L', photoUrl: null, inscriptions: [] });
      await expect(service.pdfEleve('ecole', 'e1')).rejects.toThrow(/affectez-le d'abord à une classe/);
      expect(genererPlancheCartesPdf).not.toHaveBeenCalled();
    });
  });

  it("signale clairement l'absence d'année scolaire", async () => {
    prisma.anneeScolaire.findFirst.mockResolvedValue(null);
    await expect(service.infoEleve('ecole', 'e1')).rejects.toThrow('Aucune année scolaire définie');
  });
});
