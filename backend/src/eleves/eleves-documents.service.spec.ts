import { NotFoundException } from '@nestjs/common';
import { ElevesDocumentsService, nomLisible } from './eleves-documents.service';
import { createPrismaMock } from '../../test/helpers/prisma-mock';

const FICHIER = { originalname: 'extrait.pdf', filename: '123-abc.pdf', mimetype: 'application/pdf', size: 2048 };
const ELEVE = {
  id: 'e1',
  nom: 'Camara',
  prenom: 'Awa',
  genre: 'F',
  dateNaissance: null,
  lieuNaissance: null,
  parentsLiens: [{ parentTuteur: { nom: 'Camara', prenom: 'Sekou', telephone: '620000000' } }],
};

describe('ElevesDocumentsService', () => {
  let prisma: any;
  let service: ElevesDocumentsService;

  beforeEach(() => {
    prisma = createPrismaMock();
    prisma.eleve.findFirst.mockResolvedValue(ELEVE);
    prisma.documentDemande.create.mockImplementation(({ data }: any) => ({ id: 'd1', ...data }));
    service = new ElevesDocumentsService(prisma);
  });

  it("range la pièce avec la demande d'inscription de l'élève", async () => {
    prisma.demandeInscription.findFirst.mockResolvedValue({ id: 'dem1' });
    const doc = await service.ajouter('ecole', 'e1', 'EXTRAIT_NAISSANCE', FICHIER);
    expect(doc).toMatchObject({ demandeId: 'dem1', type: 'EXTRAIT_NAISSANCE', nomFichier: 'extrait.pdf' });
    expect(prisma.demandeInscription.create).not.toHaveBeenCalled();
  });

  it('crée un dossier (demande acceptée) pour un élève qui n’en a pas', async () => {
    prisma.demandeInscription.findFirst.mockResolvedValue(null);
    prisma.demandeInscription.create.mockResolvedValue({ id: 'dem2' });
    const doc = await service.ajouter('ecole', 'e1', 'PHOTO', FICHIER);
    expect(prisma.demandeInscription.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ eleveId: 'e1', statut: 'ACCEPTEE', nomParent: 'Camara', telephoneParent: '620000000' }),
    });
    expect(doc.demandeId).toBe('dem2');
  });

  it('refuse un type inconnu et un élève d’une autre école', async () => {
    await expect(service.ajouter('ecole', 'e1', 'PASSEPORT', FICHIER)).rejects.toThrow('Type de document invalide');
    prisma.eleve.findFirst.mockResolvedValue(null);
    await expect(service.ajouter('ecole', 'e1', 'PHOTO', FICHIER)).rejects.toThrow(NotFoundException);
  });

  it('modifie le type ou remplace le fichier d’une pièce de cet élève seulement', async () => {
    prisma.documentDemande.findFirst.mockResolvedValue({ id: 'd1', cheminFichier: 'ancien.pdf' });
    prisma.documentDemande.update.mockResolvedValue({ id: 'd1' });
    await service.modifier('ecole', 'e1', 'd1', 'ATTESTATION', FICHIER);
    expect(prisma.documentDemande.findFirst).toHaveBeenCalledWith({ where: { id: 'd1', demande: { ecoleId: 'ecole', eleveId: 'e1' } } });
    expect(prisma.documentDemande.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ type: 'ATTESTATION', cheminFichier: '123-abc.pdf', statut: 'EN_ATTENTE' }),
    });

    prisma.documentDemande.findFirst.mockResolvedValue(null);
    await expect(service.supprimer('ecole', 'e1', 'autre')).rejects.toThrow('Document introuvable');
  });

  it('rend lisibles les noms de fichiers accentués', () => {
    const recu = Buffer.from('Capture d’écran.png', 'utf8').toString('latin1');
    expect(nomLisible(recu, true)).toBe('Capture d’écran.png');
    expect(nomLisible(recu)).toBe('Capture d’écran.png');
    expect(nomLisible('Relevé.pdf')).toBe('Relevé.pdf');
  });
});
