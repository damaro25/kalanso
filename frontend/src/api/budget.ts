import { apiClient } from './client';
import { getQueryClient } from '../offline/queryClientRef';

// Budget de trésorerie (prévisionnel d'une année scolaire), comme la feuille papier de l'école.
// Colonnes : octobre à juin, puis les vacances (10 valeurs).
export interface LigneMontants {
  libelle: string;
  parMois: number[];
  total: number;
}

export interface PosteBudget {
  id: string;
  poste: string;
  ordre: number;
  montants: number[];
  total: number;
}

export interface TresorerieBudget {
  encaissements: number[];
  decaissements: number[];
  flux: number[];
  initiale: number[];
  finale: number[];
  totalEncaissements: number;
  totalDecaissements: number;
  benefice: number;
}

export interface RegimeBudget {
  regime: string;
  libelle: string;
  lignes: LigneMontants[];
  sousTotal: { parMois: number[]; total: number };
}

// Prévisionnel : écolage facturé réparti d'octobre à juin, postes de dépenses saisis (10 colonnes, la dernière
// pour les vacances), et le réel ramené à ces colonnes pour comparer.
export interface PrevisionBudget {
  colonnes: string[];
  encaissements: { regimes: RegimeBudget[]; creche: LigneMontants; total: { parMois: number[]; total: number } };
  decaissements: { lignes: PosteBudget[]; total: { parMois: number[]; total: number } };
  tresorerie: TresorerieBudget;
  realise: {
    encaissements: number[];
    decaissements: number[];
    finale: number[];
    totalEncaissements: number;
    totalDecaissements: number;
    ecartEncaissements: number[]; // réel − prévu
  };
}

// Réel : tous les paiements, recettes, salaires et dépenses enregistrés, mois par mois (octobre à juin, plus
// « Avant octobre » / « Après juin » quand elles ne sont pas vides).
export interface ReelBudget {
  colonnes: { libelle: string; hors?: 'AVANT' | 'APRES' }[];
  encaissements: {
    regimes: RegimeBudget[];
    creche: LigneMontants;
    autres: LigneMontants[];
    totalPaiements: number;
    total: { parMois: number[]; total: number };
  };
  decaissements: { lignes: LigneMontants[]; total: { parMois: number[]; total: number } };
  tresorerie: TresorerieBudget;
}

export interface BudgetTresorerie {
  anneeScolaire: { id: string; libelle: string };
  reel: ReelBudget;
  prevision: PrevisionBudget;
}

// Après un paiement ou une dépense : le budget et les tableaux financiers se mettent à jour tout de suite.
export function rafraichirFinances() {
  try {
    getQueryClient().invalidateQueries({
      predicate: (q) => {
        const cle = q.queryKey[0];
        return typeof cle === 'string' && (cle === 'budget-tresorerie' || cle === 'dashboard-tresorerie' || cle.startsWith('finance') || cle.startsWith('bordereau'));
      },
    });
  } catch {
    // pas de client de requêtes (tests) : rien à rafraîchir
  }
}

export async function fetchBudget(anneeScolaireId?: string): Promise<BudgetTresorerie> {
  const { data } = await apiClient.get('/finance/budget', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function ajouterPosteBudget(input: { anneeScolaireId?: string; poste: string; montants: number[] }) {
  const { data } = await apiClient.post('/finance/budget/postes', input);
  return data;
}

export async function ajouterPostesHabituels(anneeScolaireId?: string): Promise<BudgetTresorerie> {
  const { data } = await apiClient.post('/finance/budget/postes-habituels', null, {
    params: anneeScolaireId ? { anneeScolaireId } : {},
  });
  return data;
}

// Le code des dépenses passe dans un en-tête, pas dans l'adresse (journaux d'accès du serveur).
export async function modifierPosteBudget(id: string, input: { poste: string; montants: number[] }, code: string) {
  const { data } = await apiClient.patch(`/finance/budget/postes/${id}`, input, { headers: { 'X-Code-Suppression': code } });
  return data;
}

export async function supprimerPosteBudget(id: string, code: string): Promise<void> {
  await apiClient.delete(`/finance/budget/postes/${id}`, { headers: { 'X-Code-Suppression': code } });
}
