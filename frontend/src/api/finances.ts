import { apiClient } from './client';
import { offlineMutation } from '../offline/offlineMutation';

export interface TarifEcolage {
  id: string;
  libelle: string;
  montant: string;
  anneeScolaireId: string;
  niveau: { id: string; nom: string };
  anneeScolaire: { id: string; libelle: string } | null;
}

export interface Facture {
  id: string;
  libelle: string;
  montantTotal: string;
  montantPaye: string;
  statut: 'IMPAYEE' | 'PARTIELLE' | 'PAYEE' | 'ANNULEE';
  dateEcheance: string | null;
  eleve: { id: string; nom: string; prenom: string; matricule: string | null };
}

export interface CreateFactureInput {
  eleveId: string;
  libelle: string;
  montantTotal: number;
  dateEcheance?: string;
}

export interface CreatePaiementInput {
  factureId: string;
  montant: number;
  mode?: 'ESPECES' | 'VIREMENT' | 'CHEQUE' | 'AUTRE';
  reference?: string;
}

export interface CreateTarifInput {
  niveauId: string;
  anneeScolaireId: string;
  libelle: string;
  montant: number;
}

export async function fetchTarifs(): Promise<TarifEcolage[]> {
  const { data } = await apiClient.get('/tarifs-ecolage');
  return data;
}

export async function createTarif(input: CreateTarifInput): Promise<TarifEcolage> {
  const { data } = await apiClient.post('/tarifs-ecolage', input);
  return data;
}

export interface UpdateTarifInput {
  libelle?: string;
  montant?: number;
  anneeScolaireId?: string;
}

export async function updateTarif(id: string, input: UpdateTarifInput): Promise<TarifEcolage> {
  const { data } = await apiClient.patch(`/tarifs-ecolage/${id}`, input);
  return data;
}

export interface FraisInscriptionNiveau {
  id: string;
  montant: string;
  anneeScolaireId: string;
  niveau: { id: string; nom: string };
  anneeScolaire: { id: string; libelle: string } | null;
}

export interface CreateFraisInscriptionNiveauInput {
  niveauId: string;
  anneeScolaireId: string;
  montant: number;
}

export async function fetchFraisInscriptionNiveau(): Promise<FraisInscriptionNiveau[]> {
  const { data } = await apiClient.get('/frais-inscription-niveau');
  return data;
}

export async function createFraisInscriptionNiveau(
  input: CreateFraisInscriptionNiveauInput,
): Promise<FraisInscriptionNiveau> {
  const { data } = await apiClient.post('/frais-inscription-niveau', input);
  return data;
}

export interface UpdateFraisInscriptionNiveauInput {
  montant?: number;
  anneeScolaireId?: string;
}

export async function updateFraisInscriptionNiveau(
  id: string,
  input: UpdateFraisInscriptionNiveauInput,
): Promise<FraisInscriptionNiveau> {
  const { data } = await apiClient.patch(`/frais-inscription-niveau/${id}`, input);
  return data;
}

export async function fetchImpayes(): Promise<Facture[]> {
  const { data } = await apiClient.get('/factures/impayes');
  return data;
}

export async function fetchFacture(id: string) {
  const { data } = await apiClient.get(`/factures/${id}`);
  return data;
}

export async function createFacture(input: CreateFactureInput): Promise<Facture> {
  const { data } = await apiClient.post('/factures', input);
  return data;
}

// createPaiement fait un create() brut côté serveur (pas d'upsert) : id
// pré-généré côté client + garde-fou d'idempotence dans paiements.service.ts.
export async function createPaiement(input: CreatePaiementInput): Promise<{ id: string }> {
  return offlineMutation<CreatePaiementInput, { id: string }>({
    method: 'POST',
    url: '/paiements',
    body: input,
    entityType: 'Paiement',
    invalidateKeys: [['factures-impayes']],
    applyOptimistic: (queryClient, body) => {
      queryClient.setQueryData<Facture[]>(['factures-impayes'], (prev) =>
        prev?.map((f) => {
          if (f.id !== body.factureId) return f;
          const nouveauMontantPaye = Number(f.montantPaye) + body.montant;
          const statut: Facture['statut'] = nouveauMontantPaye >= Number(f.montantTotal) ? 'PAYEE' : 'PARTIELLE';
          return { ...f, montantPaye: String(nouveauMontantPaye), statut };
        }),
      );
    },
  });
}

export async function ouvrirRecu(paiementId: string) {
  const response = await apiClient.get(`/paiements/${paiementId}/recu`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export async function ouvrirFacturePdf(factureId: string) {
  const response = await apiClient.get(`/factures/${factureId}/pdf`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
  window.open(url, '_blank');
}

export interface ImportResultat {
  creees: number;
  erreurs: { ligne: number; motif: string }[];
}

export async function importFactures(fichier: File): Promise<ImportResultat> {
  const formData = new FormData();
  formData.append('fichier', fichier);
  const { data } = await apiClient.post('/factures/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

function telechargerBlob(response: { data: BlobPart }, nomFichier: string) {
  const url = window.URL.createObjectURL(new Blob([response.data]));
  const link = document.createElement('a');
  link.href = url;
  link.download = nomFichier;
  link.click();
}

export async function telechargerFactures() {
  const response = await apiClient.get('/reporting/export/factures.xlsx', { responseType: 'blob' });
  telechargerBlob(response, 'factures.xlsx');
}

export async function telechargerModeleFactures() {
  const response = await apiClient.get('/reporting/export/factures-modele.xlsx', { responseType: 'blob' });
  telechargerBlob(response, 'modele-import-factures.xlsx');
}
