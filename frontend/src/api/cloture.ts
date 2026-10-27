import { apiClient } from './client';
import { rafraichirFinances } from './budget';

const DELAI_LONG = 180_000; // sauvegarde + clôture : peut prendre du temps

export interface OptionsCloture {
  anneeId?: string;
  suivanteId?: string;
  suivanteLibelle?: string;
  suivanteDebut?: string;
  suivanteFin?: string;
  copierClasses?: boolean;
  tarifs?: 'IDENTIQUES' | 'AJUSTES' | 'AUCUN';
  ajustementPct?: number;
  decalerEcheances?: boolean;
  fraisReinscription?: number | null;
  reinscrire?: boolean;
  genererFactures?: boolean;
  rendreCourante?: boolean;
}

export interface ControlesCloture {
  impayes: { nombre: number; reste: number };
  paiements: { nombre: number; total: number };
  elevesInscrits: number;
  facturesIncoherentes: number;
  recus: { sansNumero: number; doublons: number };
  suivante: { classes: number; tarifs: number };
  alertes: string[];
  bloquant: boolean;
}

export interface PlanCloture {
  anneeCloturee: { id: string; libelle: string; dejaCloturee: boolean };
  anneeSuivante: { id: string | null; libelle: string; aCreer: boolean; dateDebut: string; dateFin: string };
  classesACreer: number;
  tarifsACreer: number;
  fraisACreer: number;
  reinscriptions: number;
  reinscriptionsParClasse: { origine: string; destination: string; eleves: number }[];
  sortants: { nom: string; classe: string }[];
  sansDestination: { nom: string; classe: string; niveau?: string }[];
  dejaReinscrits: number;
  totalFacturePrevu: number;
}

export interface RapportCloture extends PlanCloture {
  facturesCreees: number;
  sauvegarde: string | null;
  executeLe: string;
  controles: ControlesCloture;
}

export interface ClotureHistorique {
  anneeId: string;
  libelle: string;
  clotureLe: string;
  cloturePar: string | null;
  resume: (Partial<RapportCloture> & { relance?: Partial<RapportCloture> }) | null;
}

export async function apercuCloture(options: OptionsCloture): Promise<{ controles: ControlesCloture; plan: PlanCloture }> {
  const { data } = await apiClient.post('/finance/cloture/apercu', options);
  return data;
}

export async function executerCloture(options: OptionsCloture & { code: string; sansSauvegarde?: boolean }): Promise<RapportCloture> {
  const { data } = await apiClient.post('/finance/cloture/executer', options, { timeout: DELAI_LONG });
  rafraichirFinances();
  return data;
}

export async function fetchHistoriqueClotures(): Promise<ClotureHistorique[]> {
  const { data } = await apiClient.get('/finance/cloture/historique');
  return data;
}
