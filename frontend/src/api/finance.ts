import { apiClient } from './client';
import { rafraichirFinances } from './budget';

export interface FinanceDashboard {
  anneeScolaire: { id: string; libelle: string };
  moisCourant: string;
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
  anneeScolaire: { id: string; libelle: string };
  totalRecettes: number;
  totalDepenses: number;
  resultatNet: number;
  parMois: { annee: number; mois: number; libelle: string; recettes: number; depenses: number; resultat: number }[];
}

export interface RecettesParMois {
  anneeScolaire: { id: string; libelle: string };
  total: number;
  parMois: { annee: number; mois: number; libelle: string; montant: number; hors?: 'AVANT' | 'APRES' }[];
}

export interface SalairesParMois {
  anneeScolaire: { id: string; libelle: string };
  total: number;
  parMois: { annee: number; mois: number; libelle: string; montant: number; cumul: number }[];
}

export interface LigneTresorerie {
  libelle: string;
  origine: 'ELEVES' | 'MOUVEMENT' | 'SALAIRES';
  parMois: number[];
  total: number;
}

export interface BlocTresorerie {
  lignes: LigneTresorerie[];
  parMois: number[];
  total: number;
}

// Tableau de trésorerie mensuel : FT = E − D, Ti = Tf du mois précédent (0 le
// premier mois), Tf = FT + Ti. Tous les tableaux sont indexés comme `mois`.
export interface TresorerieMensuelle {
  anneeScolaire: { id: string; libelle: string };
  periode: { debut: string; fin: string }; // AAAA-MM-JJ
  // Octobre à juin ; « hors » marque la colonne des opérations avant octobre / après juin (présente seulement si non vide).
  mois: { annee: number; mois: number; libelle: string; hors?: 'AVANT' | 'APRES' }[];
  encaissements: BlocTresorerie;
  decaissements: BlocTresorerie;
  flux: number[];
  tresorerieInitiale: number[];
  tresorerieFinale: number[];
  benefice: number;
}

// Statistiques de paiement d'un groupe d'élèves inscrits (garçons, filles ou total).
export interface LigneStatistiquePaiement {
  effectif: number;
  payes: number; // soldés
  nonPayes: number; // il leur reste quelque chose à payer
  dontPartiels: number; // parmi les non payés : ont déjà versé quelque chose
  sansFacture: number;
  totalFacture: number;
  totalPaye: number;
  totalRestant: number;
  taux: number; // % encaissé
}

export interface StatistiquesPaiements {
  anneeScolaire: { id: string; libelle: string };
  filtres: {
    niveaux: { id: string; nom: string }[];
    classes: { id: string; nom: string; niveauId: string }[];
  };
  garcons: LigneStatistiquePaiement;
  filles: LigneStatistiquePaiement;
  total: LigneStatistiquePaiement;
}

export type TypeOperation = 'Inscription' | 'Réinscription' | 'Écolage' | 'Trimestre 1' | 'Trimestre 2' | 'Trimestre 3' | 'Autre';

// Bordereau journalier : ce qui a été encaissé un jour donné, une ligne par élève : tous ses versements du jour y sont cumulés.
export interface LigneBordereau {
  paiementIds: string[]; // pour ouvrir les reçus, dans l'ordre d'encaissement
  numerosRecu: string[]; // N° des reçus tels qu'imprimés (« 001480 »)
  eleveId: string;
  matricule: string | null;
  nomComplet: string;
  classe: string;
  niveau: string;
  fraisInscription: number;
  typeInscription: string; // « Inscription », « Réinscription », vide sinon
  assurance: number;
  totalInscriptionAssurance: number;
  fraisEtudes: number; // la part écolage / trimestres des versements
  fraisFormations: number; // formations supplémentaires (arabe, anglais, informatique...)
  totalPaye: number;
  date: string; // AAAA-MM-JJ
  observation: string; // mode(s) de paiement
}

export interface TotauxBordereau {
  fraisInscription: number;
  assurance: number;
  totalInscriptionAssurance: number;
  fraisEtudes: number;
  fraisFormations: number;
  totalPaye: number;
}

export interface BordereauJournalier {
  date: string;
  ecole: { nom: string; sigle: string | null; ville: string | null; nomDirecteur: string | null; nomComptable: string | null };
  filtres: { niveaux: { id: string; nom: string }[] };
  lignes: LigneBordereau[];
  totaux: TotauxBordereau;
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

export async function fetchRecettesParMois(anneeScolaireId?: string): Promise<RecettesParMois> {
  const { data } = await apiClient.get('/finance/recettes-par-mois', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function fetchSalairesParMois(anneeScolaireId?: string): Promise<SalairesParMois> {
  const { data } = await apiClient.get('/finance/salaires-par-mois', { params: anneeScolaireId ? { anneeScolaireId } : {} });
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

export async function fetchCompteResultatParMois(anneeScolaireId?: string): Promise<CompteResultatMois> {
  const { data } = await apiClient.get('/finance/compte-resultat-par-mois', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function fetchTresorerieParMois(anneeScolaireId?: string): Promise<TresorerieMensuelle> {
  const { data } = await apiClient.get('/finance/tresorerie-par-mois', { params: anneeScolaireId ? { anneeScolaireId } : {} });
  return data;
}

export async function fetchStatistiquesPaiements(filtres: { niveauId?: string; classeId?: string } = {}): Promise<StatistiquesPaiements> {
  const { data } = await apiClient.get('/finance/statistiques-paiements', {
    params: { ...(filtres.niveauId ? { niveauId: filtres.niveauId } : {}), ...(filtres.classeId ? { classeId: filtres.classeId } : {}) },
  });
  return data;
}

// Tableau de bord : paiements par tranche et par genre, pour chaque régime (« TOUS » en premier)
export interface TranchePaiement {
  cle: 'INSCRIPTION' | 'T1' | 'T2' | 'T3' | 'AUTRE';
  libelle: string;
  attendu: number;
  paye: number;
  reste: number;
  taux: number;
  soldes: number;
  nonSoldes: number;
}

export interface GenrePaiement {
  genre: 'M' | 'F' | 'TOTAL';
  libelle: string;
  effectif: number;
  attendu: number;
  paye: number;
  reste: number;
  taux: number;
}

export interface PaiementsParTranche {
  anneeScolaire: { id: string; libelle: string };
  regimes: { regime: string; libelle: string; tranches: TranchePaiement[]; genres: GenrePaiement[] }[];
}

export async function fetchPaiementsParTranche(filtres: { anneeScolaireId?: string; classeId?: string } = {}): Promise<PaiementsParTranche> {
  const { data } = await apiClient.get('/finance/paiements-par-tranche', {
    params: {
      ...(filtres.anneeScolaireId ? { anneeScolaireId: filtres.anneeScolaireId } : {}),
      ...(filtres.classeId ? { classeId: filtres.classeId } : {}),
    },
  });
  return data;
}

function paramsBordereau(filtres: { date?: string; niveauId?: string }) {
  return { ...(filtres.date ? { date: filtres.date } : {}), ...(filtres.niveauId ? { niveauId: filtres.niveauId } : {}) };
}

export async function fetchBordereauJournalier(filtres: { date?: string; niveauId?: string } = {}): Promise<BordereauJournalier> {
  const { data } = await apiClient.get('/finance/bordereau-journalier', { params: paramsBordereau(filtres) });
  return data;
}

export async function telechargerBordereauJournalier(filtres: { date?: string; niveauId?: string } = {}) {
  const response = await apiClient.get('/finance/export/bordereau-journalier.xlsx', {
    params: paramsBordereau(filtres),
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bordereau-journalier${filtres.date ? `-${filtres.date}` : ''}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function fetchMouvements(anneeScolaireId?: string, type?: TypeMouvement): Promise<Mouvement[]> {
  const { data } = await apiClient.get('/finance/mouvements', {
    params: { ...(anneeScolaireId ? { anneeScolaireId } : {}), ...(type ? { type } : {}) },
  });
  return data;
}

export async function creerMouvement(input: CreateMouvementInput): Promise<Mouvement> {
  const { data } = await apiClient.post('/finance/mouvements', input);
  rafraichirFinances();
  return data;
}

// Le code de suppression (exigé pour une dépense) passe dans un en-tête, pas dans l'adresse : il resterait sinon
// dans les journaux d'accès du serveur.
export async function supprimerMouvement(id: string, code?: string): Promise<void> {
  await apiClient.delete(`/finance/mouvements/${id}`, { headers: code ? { 'X-Code-Suppression': code } : undefined });
  rafraichirFinances();
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

export async function telechargerTresorerie(anneeScolaireId?: string, libelleAnnee?: string) {
  const response = await apiClient.get('/finance/export/tresorerie.xlsx', {
    params: anneeScolaireId ? { anneeScolaireId } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = `tresorerie-mensuelle${libelleAnnee ? `-${libelleAnnee}` : ''}.xlsx`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function telechargerBilanFinancier(anneeScolaireId?: string) {
  const response = await apiClient.get('/finance/export/bilan.xlsx', {
    params: anneeScolaireId ? { anneeScolaireId } : {},
    responseType: 'blob',
  });
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'bilan-financier.xlsx';
  link.click();
}
