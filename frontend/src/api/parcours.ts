import { apiClient } from './client';

export type Decision = 'ADMIS' | 'REDOUBLE';

export interface EleveParcours {
  eleve: {
    id: string;
    nom: string;
    prenom: string;
    genre: 'M' | 'F';
  };
  moyenneTrimestre1: number | null;
  moyenneTrimestre2: number | null;
  moyenneTrimestre3: number | null;
  moyenneAnnuelle: number;
  decision: Decision;
}

export interface ParcoursClasse {
  classe: {
    id: string;
    nom: string;
    niveau: { id: string; nom: string; ordre: number };
    anneeScolaire: { id: string; libelle: string };
  };
  seuilPassage: number;
  parcours: EleveParcours[];
}

export interface ClasseDestination {
  id: string;
  nom: string;
  niveauId: string;
  niveau: { id: string; nom: string; ordre: number };
  anneeScolaire: { id: string; libelle: string };
}

export interface DestinationsClasse {
  niveauActuel: { id: string; nom: string; ordre: number };
  niveauSuperieur: { id: string; nom: string; ordre: number } | null;
  classesDisponibles: ClasseDestination[];
}

export async function fetchParcoursClasse(classeId: string): Promise<ParcoursClasse> {
  const { data } = await apiClient.get(`/parcours/classe/${classeId}`);
  return data;
}

export async function fetchDestinationsClasse(classeId: string): Promise<DestinationsClasse> {
  const { data } = await apiClient.get(`/parcours/classe/${classeId}/destinations`);
  return data;
}

export interface ValiderPassageResult {
  reussies: number;
  echecs: { eleveId: string; erreur: string }[];
}

export async function validerPassage(entries: { eleveId: string; classeDestinationId: string }[]): Promise<ValiderPassageResult> {
  const { data } = await apiClient.post('/parcours/valider', { entries });
  return data;
}
