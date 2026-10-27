import { apiClient } from './client';
import { rafraichirFinances } from './budget';
import type { Regime } from './finances';

// Formations supplémentaires (arabe, anglais, informatique...) payées au mois, gratuites pour certains régimes.
export interface FormationSupplementaire {
  id: string;
  nom: string;
  tarifMensuel: number;
  regimesGratuits: Regime[];
  actif: boolean;
  _count?: { inscriptions: number }; // élèves inscrits actuellement
}

export interface FormationsEleve {
  anneeScolaire: { id: string; libelle: string };
  regime: Regime | null;
  mois?: { code: string; libelle: string }; // mois en cours
  facturation?: ResultatFacturation | null; // après une inscription : facture du mois créée
  formations: {
    factureMois?: { id: string; montant: number; paye: number } | null;
    inscriptionId: string;
    formationId: string;
    nom: string;
    dateDebut: string;
    tarifMensuel: number;
    gratuit: boolean;
    montantMensuel: number;
  }[];
}

export interface ResultatFacturation {
  mois: string;
  creees: number;
  dejaFacturees: number;
  gratuites: number;
}

export async function fetchFormations(): Promise<FormationSupplementaire[]> {
  const { data } = await apiClient.get('/formations');
  return data;
}

export async function creerFormation(input: Omit<FormationSupplementaire, 'id' | '_count'>) {
  const { data } = await apiClient.post('/formations', input);
  return data;
}

export async function modifierFormation(id: string, input: Partial<Omit<FormationSupplementaire, 'id' | '_count'>>) {
  const { data } = await apiClient.patch(`/formations/${id}`, input);
  return data;
}

export async function supprimerFormation(id: string): Promise<void> {
  await apiClient.delete(`/formations/${id}`);
}

export async function ajouterFormationsHabituelles(): Promise<{ ajoutees: string[] }> {
  const { data } = await apiClient.post('/formations/habituelles');
  return data;
}

export async function fetchFormationsEleve(eleveId: string): Promise<FormationsEleve> {
  const { data } = await apiClient.get(`/eleves/${eleveId}/formations`);
  return data;
}

export async function inscrireFormation(eleveId: string, formationId: string): Promise<FormationsEleve> {
  const { data } = await apiClient.post(`/eleves/${eleveId}/formations`, { formationId });
  return data;
}

export async function desinscrireFormation(eleveId: string, formationId: string): Promise<FormationsEleve> {
  const { data } = await apiClient.delete(`/eleves/${eleveId}/formations/${formationId}`);
  return data;
}

// Facture le mois (AAAA-MM) pour tous les élèves inscrits, ou pour un seul ; jamais deux fois le même mois.
export async function facturerFormations(mois: string, eleveId?: string): Promise<ResultatFacturation> {
  const { data } = await apiClient.post('/formations/facturer', { mois, ...(eleveId ? { eleveId } : {}) });
  rafraichirFinances();
  return data;
}

// Mois courant au format AAAA-MM (valeur par défaut des boutons « Facturer le mois »)
export function moisCourant(): string {
  return new Date().toISOString().slice(0, 7);
}

export function resumeFacturation(r: ResultatFacturation): string {
  const morceaux = [`${r.creees} facture${r.creees > 1 ? 's' : ''} créée${r.creees > 1 ? 's' : ''}`];
  if (r.dejaFacturees) morceaux.push(`${r.dejaFacturees} déjà facturée${r.dejaFacturees > 1 ? 's' : ''}`);
  if (r.gratuites) morceaux.push(`${r.gratuites} gratuite${r.gratuites > 1 ? 's' : ''}`);
  return morceaux.join(' · ');
}
