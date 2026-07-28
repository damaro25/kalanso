import { apiClient } from './client';

export type OperateurMobileMoney = 'ORANGE_MONEY' | 'MTN_MOMO';
export type StatutTransaction = 'EN_ATTENTE' | 'REUSSIE' | 'ECHOUEE' | 'ANNULEE';

export const OPERATEURS: { value: OperateurMobileMoney; label: string }[] = [
  { value: 'ORANGE_MONEY', label: 'Orange Money' },
  { value: 'MTN_MOMO', label: 'MTN MoMo' },
];

export interface TransactionMobileMoney {
  id: string;
  operateur: OperateurMobileMoney;
  telephone: string;
  montant: string;
  statut: StatutTransaction;
  reference: string;
  createdAt: string;
  facture: { id: string; libelle: string; eleve: { nom: string; prenom: string } } | null;
}

export interface InitierTransactionInput {
  factureId: string;
  operateur: OperateurMobileMoney;
  telephone: string;
  montant: number;
}

export async function fetchTransactions(): Promise<TransactionMobileMoney[]> {
  const { data } = await apiClient.get('/mobile-money/transactions');
  return data;
}

export async function initierTransaction(input: InitierTransactionInput): Promise<TransactionMobileMoney> {
  const { data } = await apiClient.post('/mobile-money/transactions', input);
  return data;
}

export async function confirmerTransaction(id: string) {
  const { data } = await apiClient.post(`/mobile-money/transactions/${id}/confirmer`);
  return data;
}

export async function echecTransaction(id: string) {
  const { data } = await apiClient.post(`/mobile-money/transactions/${id}/echec`);
  return data;
}
