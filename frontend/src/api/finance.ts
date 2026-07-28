import { apiClient } from './client';

export interface FinanceDashboard {
  anneeScolaire: { id: string; libelle: string };
  moisCourant: string;
  anneeCivile: number;
  ecolage: {
    totalFacture: number;
    totalEncaisse: number;
    totalRestant: number;
    tauxRecouvrement: number;
  };
  inscription: {
    totalFacture: number;
    totalEncaisse: number;
    totalRestant: number;
    tauxRecouvrement: number;
  };
  eleves: {
    nbInscrits: number;
    nbAJour: number;
    nbEnRetard: number;
    nbSansFacture: number;
  };
  salaires: {
    masseSalarialeMois: number;
    masseSalarialeCumul: number;
  };
  compteResultat: {
    ecolageEncaisse: number;
    inscriptionEncaisse: number;
    autresRecettes: number;
    recettesTotales: number;
    depensesSalaires: number;
    depensesAutres: number;
    depensesTotales: number;
    resultatNet: number;
  };
  soldeNet: number;
}

export type TypeMouvement = 'RECETTE' | 'DEPENSE';

export interface Mouvement {
  id: string;
  type: TypeMouvement;
  categorie: string;
  libelle: string;
  montant: string;
  date: string;
  modePaiement: string | null;
}

export interface CreateMouvementInput {
  type: TypeMouvement;
  categorie: string;
  libelle: string;
  montant: number;
  date?: string;
  modePaiement?: string;
}

export interface CompteResultatMois {
  annee: number;
  totalRecettes: number;
  totalDepenses: number;
  resultatNet: number;
  parMois: { mois: number; libelle: string; recettes: number; depenses: number; resultat: number }[];
}

export interface RecettesParMois {
  annee: number;
  total: number;
  parMois: { mois: number; libelle: string; montant: number }[];
}

export interface SalairesParMois {
  annee: number;
  total: number;
  parMois: { mois: number; libelle: string; montant: number; cumul: number }[];
}

export interface RecouvrementClasse {
  classeId: string;
  classe: string;
  niveau: string;
  nbEleves: number;
  totalFacture: number;
  totalPaye: number;
  totalRestant: number;
  taux: number;
}

export interface EleveFinance {
  eleveId: string;
  nom: string;
  prenom: string;
  matricule: string | null;
  classe: string;
  totalFacture: number;
  totalPaye: number;
  reste: number;
  aJour: boolean;
}

export async function fetchFinanceDashboard(anneeScolaireId?: string): Promise<FinanceDashboard> {
  const { data } = await apiClient.get('/finance/dashboard', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function fetchRecettesParMois(annee: number): Promise<RecettesParMois> {
  const { data } = await apiClient.get('/finance/recettes-par-mois', { params: { annee } });
  return data;
}

export async function fetchSalairesParMois(annee: number): Promise<SalairesParMois> {
  const { data } = await apiClient.get('/finance/salaires-par-mois', { params: { annee } });
  return data;
}

export async function fetchRecouvrementParClasse(anneeScolaireId?: string): Promise<{ classes: RecouvrementClasse[] }> {
  const { data } = await apiClient.get('/finance/recouvrement-par-classe', {
    params: anneeScolaireId ? { anneeScolaireId } : {},
  });
  return data;
}

export async function fetchElevesFinance(
  filtre: 'TOUS' | 'A_JOUR' | 'EN_RETARD',
  anneeScolaireId?: string,
): Promise<{ eleves: EleveFinance[] }> {
  const { data } = await apiClient.get('/finance/eleves', {
    params: { filtre, ...(anneeScolaireId ? { anneeScolaireId } : {}) },
  });
  return data;
}

export async function fetchCompteResultatParMois(annee: number): Promise<CompteResultatMois> {
  const { data } = await apiClient.get('/finance/compte-resultat-par-mois', { params: { annee } });
  return data;
}

export async function fetchMouvements(annee?: number, type?: TypeMouvement): Promise<Mouvement[]> {
  const { data } = await apiClient.get('/finance/mouvements', { params: { ...(annee ? { annee } : {}), ...(type ? { type } : {}) } });
  return data;
}

export async function creerMouvement(input: CreateMouvementInput): Promise<Mouvement> {
  const { data } = await apiClient.post('/finance/mouvements', input);
  return data;
}

export async function supprimerMouvement(id: string): Promise<void> {
  await apiClient.delete(`/finance/mouvements/${id}`);
}

export interface RegenererFacturesResult {
  eleveTraites: number;
}

// Rattrape les factures d'écolage / inscription manquantes pour les élèves déjà
// inscrits (tarif ajouté après coup, ou élèves inscrits avant l'automatisation).
export async function regenererFactures(): Promise<RegenererFacturesResult> {
  const { data } = await apiClient.post('/finance/regenerer-factures');
  return data;
}

export async function telechargerBilanFinancier(annee: number) {
  const response = await apiClient.get('/finance/export/bilan.xlsx', { params: { annee }, responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bilan-financier.xlsx';
  link.click();
}
