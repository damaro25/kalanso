import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';

// Libellés lisibles des modèles Prisma pour les messages d'erreur.
const LIBELLES: Record<string, string> = {
  Eleve: 'élève',
  Classe: 'classe',
  Niveau: 'niveau',
  AnneeScolaire: 'année scolaire',
  Facture: 'facture',
  Paiement: 'paiement',
  Matiere: 'matière',
  Personnel: 'membre du personnel',
  Utilisateur: 'compte utilisateur',
  Salle: 'salle',
  Creneau: 'créneau',
  Livre: 'livre',
  Emprunt: 'emprunt',
  Materiel: 'matériel',
  BulletinPaie: 'bulletin de paie',
  TarifEcolage: "tarif d'écolage",
  FraisInscriptionNiveau: "frais d'inscription",
  DemandeInscription: "demande d'inscription",
  Inscription: 'inscription',
  ParentTuteur: 'parent / tuteur',
  MouvementFinancier: 'mouvement financier',
};

// Transforme les erreurs « attendues » de Prisma en réponses HTTP exploitables
// (404 / 409) au lieu d'un 500 opaque : enregistrement introuvable (P2025),
// doublon sur une contrainte d'unicité (P2002), enregistrement encore référencé
// ailleurs (P2003). Toute autre erreur reste inchangée (donc 500 + journal).
export function mapPrismaError(exception: unknown): HttpException | null {
  if (!exception || typeof exception !== 'object') return null;
  const e = exception as { code?: unknown; name?: unknown; meta?: { modelName?: unknown } };
  const estPrisma = e.name === 'PrismaClientKnownRequestError' || (typeof e.code === 'string' && /^P\d{4}$/.test(e.code));
  if (!estPrisma) return null;

  const modele = typeof e.meta?.modelName === 'string' ? e.meta.modelName : undefined;
  const libelle = modele ? LIBELLES[modele] : undefined;

  switch (e.code) {
    case 'P2025':
      return new NotFoundException(libelle ? `${capitaliser(libelle)} introuvable` : 'Élément introuvable');
    case 'P2002':
      return new ConflictException(
        libelle ? `Doublon : cet élément (${libelle}) existe déjà` : 'Doublon : cet élément existe déjà',
      );
    case 'P2003':
      return new ConflictException(
        libelle
          ? `Opération impossible : cet élément (${libelle}) est encore utilisé par d'autres données`
          : "Opération impossible : cet élément est encore utilisé par d'autres données",
      );
    default:
      return null;
  }
}

function capitaliser(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

@Catch()
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    super.catch(mapPrismaError(exception) ?? exception, host);
  }
}
