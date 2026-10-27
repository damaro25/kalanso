import { apiClient } from './client';
import { rafraichirFinances } from './budget';
import type { Regime } from './finances';

// T-shirt : annuelle, par élève ; montant par année (et par cycle) dans Configuration.
export type StatutAssurance = 'PAYEE' | 'PARTIELLE' | 'NON_PAYEE' | 'NON_FACTUREE';

export const STATUTS_ASSURANCE: { value: StatutAssurance; label: string; couleur: string }[] = [
  { value: 'PAYEE', label: 'Payée', couleur: 'green' },
  { value: 'PARTIELLE', label: 'Partiellement payée', couleur: 'yellow' },
  { value: 'NON_PAYEE', label: 'Non payée', couleur: 'red' },
  { value: 'NON_FACTUREE', label: 'Non facturée', couleur: 'gray' },
];

export interface ConfigurationAssurance {
  anneeScolaire: { id: string; libelle: string; cloturee: boolean };
  tousCycles: number | null;
  parCycle: { cycle: string; montant: number | null }[];
}

export interface LigneAssurance {
  eleveId: string;
  matricule: string | null;
  nomComplet: string;
  classe: string;
  regime: Regime;
  factureId: string | null;
  montant: number;
  paye: number;
  reste: number;
  statut: StatutAssurance;
}

export interface SuiviAssurance {
  anneeScolaire: { id: string; libelle: string; cloturee: boolean };
  montantConfigure: boolean;
  totaux: {
    eleves: number;
    attendu: number;
    paye: number;
    reste: number;
    payees: number;
    partielles: number;
    nonPayees: number;
    nonFacturees: number;
  };
  lignes: LigneAssurance[];
}

export interface FiltresAssurance {
  anneeScolaireId?: string;
  classeId?: string;
  regime?: Regime;
  statut?: StatutAssurance;
}

const params = (f: FiltresAssurance) =>
  Object.fromEntries(Object.entries(f).filter(([, v]) => v !== undefined && v !== null && v !== ''));

export async function fetchConfigurationAssurance(anneeScolaireId?: string): Promise<ConfigurationAssurance> {
  const { data } = await apiClient.get('/assurance/configuration', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function enregistrerConfigurationAssurance(input: {
  anneeScolaireId: string;
  tousCycles: number | null;
  parCycle: { cycle: string; montant: number | null }[];
}): Promise<ConfigurationAssurance> {
  const { data } = await apiClient.put('/assurance/configuration', input);
  return data;
}

export async function fetchSuiviAssurance(filtres: FiltresAssurance): Promise<SuiviAssurance> {
  const { data } = await apiClient.get('/assurance/suivi', { params: params(filtres) });
  return data;
}

export async function fetchAssuranceEleve(eleveId: string): Promise<{ anneeScolaire: { libelle: string }; montantConfigure: boolean; ligne: LigneAssurance | null }> {
  const { data } = await apiClient.get(`/assurance/eleve/${eleveId}`);
  return data;
}

export async function facturerAssurance(anneeScolaireId?: string): Promise<{ anneeScolaire: string; creees: number; total: number; dejaFacturees: number; sansMontant: number }> {
  const { data } = await apiClient.post('/assurance/facturer', null, { params: anneeScolaireId ? { anneeScolaireId } : {} });
  rafraichirFinances();
  return data;
}

export async function telechargerAssurance(filtres: FiltresAssurance) {
  const response = await apiClient.get('/assurance/export.xlsx', { params: params(filtres), responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const lien = document.createElement('a');
  lien.href = url;
  lien.download = 't-shirt.xlsx';
  lien.click();
  window.URL.revokeObjectURL(url);
}
