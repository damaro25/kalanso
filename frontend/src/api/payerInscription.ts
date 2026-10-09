import { apiClient } from './client';

export type EtatInscription = 'A_PAYER' | 'PAYEE' | 'FRAIS_NON_DEFINIS';
export type TypeInscription = 'INSCRIPTION' | 'REINSCRIPTION';

// Ce qu'il reste à payer pour l'inscription (ou la réinscription) d'un élève, année en cours.
export interface ApercuInscription {
  eleveId: string;
  anneeScolaire: { id: string; libelle: string };
  classe: string;
  niveau: string;
  type: TypeInscription;
  libelle: string; // « Inscription » ou « Réinscription »
  typeModifiable: boolean; // faux dès qu'un versement a été enregistré sur la facture
  montants: { INSCRIPTION: number; REINSCRIPTION: number }; // frais du niveau pour chaque type
  factureId: string | null;
  montant: number;
  dejaPaye: number;
  reste: number;
  etat: EtatInscription;
}

export type EtatFiltreInscription = EtatInscription | 'TOUS';

// Une ligne de la liste « Paiement inscription/réinscription » : un élève inscrit cette année et l'état de ses frais.
export interface LigneInscription {
  eleveId: string;
  matricule: string | null;
  nomComplet: string;
  classeId: string;
  classe: string;
  niveau: string;
  type: TypeInscription;
  libelle: string;
  typeModifiable: boolean;
  montants: { INSCRIPTION: number; REINSCRIPTION: number };
  factureId: string | null;
  montant: number;
  dejaPaye: number;
  reste: number;
  etat: EtatInscription;
}

export interface ListeInscriptions {
  anneeScolaire: { id: string; libelle: string };
  filtres: { niveaux: { id: string; nom: string }[]; classes: { id: string; nom: string; niveauId: string }[] };
  resume: { eleves: number; aPayer: number; payees: number; fraisNonDefinis: number; resteTotal: number; encaisse: number };
  lignes: LigneInscription[];
}

export interface ResultatPaiementInscription {
  paiement: { id: string };
  factureId: string;
  type: TypeInscription;
  montant: number;
}

export async function fetchApercuInscription(eleveId: string): Promise<ApercuInscription> {
  const { data } = await apiClient.get(`/paiements/inscription/${eleveId}`);
  return data;
}

export async function fetchInscriptionsAPayer(
  filtres: { niveauId?: string; classeId?: string; type?: TypeInscription; etat?: EtatFiltreInscription } = {},
): Promise<ListeInscriptions> {
  const { data } = await apiClient.get('/paiements/inscriptions', {
    params: {
      ...(filtres.niveauId ? { niveauId: filtres.niveauId } : {}),
      ...(filtres.classeId ? { classeId: filtres.classeId } : {}),
      ...(filtres.type ? { type: filtres.type } : {}),
      ...(filtres.etat ? { etat: filtres.etat } : {}),
    },
  });
  return data;
}

// Le montant n'est pas envoyé : le serveur encaisse celui des frais d'inscription / réinscription du niveau.
export async function payerInscription(eleveId: string, mode?: string, type?: TypeInscription): Promise<ResultatPaiementInscription> {
  const { data } = await apiClient.post(`/paiements/inscription/${eleveId}`, { ...(mode ? { mode } : {}), ...(type ? { type } : {}) });
  return data;
}
