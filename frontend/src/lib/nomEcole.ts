import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { fetchEcoleConfiguration } from '../api/configuration';
import { useAuth } from '../auth/AuthContext';
import { URL_API } from '../api/urlApi';
import logoParDefaut from '../assets/logo-mameta.png';

// Le nom affiché partout (en-tête, page de connexion, titre de l'onglet, SMS côté serveur) est celui saisi dans
// Établissement > Configuration. Tant qu'il n'est pas connu, on garde l'ancien libellé.
export const NOM_PAR_DEFAUT = 'La cible du formateur';
const CLE_STOCKAGE = 'kalanso_nom_ecole';

// Rôles qui lisent la configuration de l'école (mêmes que l'API) : pour eux, le nom suit immédiatement un
// enregistrement de la page Configuration (même requête, mise à jour sur place).
const ROLES_CONFIGURATION = ['FONDATEUR', 'CHEF_ETABLISSEMENT', 'COMPTABLE'];

// Dernier nom connu, mémorisé pour l'afficher dès le chargement suivant (et hors React : notification de mise à jour).
export function nomEcoleMemorise(): string {
  try {
    return localStorage.getItem(CLE_STOCKAGE)?.trim() || NOM_PAR_DEFAUT;
  } catch {
    return NOM_PAR_DEFAUT;
  }
}

function memoriser(nom: string) {
  try {
    localStorage.setItem(CLE_STOCKAGE, nom);
  } catch {
    // stockage indisponible (navigation privée...) : le nom sera relu au prochain chargement
  }
}

async function fetchNomEcolePublic(): Promise<{ nom: string | null; logoVersion?: string }> {
  const { data } = await apiClient.get('/ecoles/public');
  return data;
}

// Logo de l'école (téléversé dans Configuration, sinon celui de Mamé-TA) : servi par l'API, avec sa version pour
// recharger l'image dès qu'il change. Avant la réponse (ou hors ligne) : le logo intégré à l'application.
export function useLogoEcole(): string {
  const { data } = useQuery({ queryKey: ['ecole-publique'], queryFn: fetchNomEcolePublic, staleTime: 5 * 60 * 1000 });
  return data?.logoVersion ? `${URL_API}/ecoles/public/logo?v=${data.logoVersion}` : logoParDefaut;
}

export { logoParDefaut };

export function useNomEcole(): string {
  const { user } = useAuth();
  const peutLireConfiguration = !!user && ROLES_CONFIGURATION.includes(user.role);
  const { data: configuration } = useQuery({
    queryKey: ['configuration-ecole'],
    queryFn: fetchEcoleConfiguration,
    enabled: peutLireConfiguration,
  });
  const { data: publique } = useQuery({ queryKey: ['ecole-publique'], queryFn: fetchNomEcolePublic, staleTime: 5 * 60 * 1000 });

  const nom = (peutLireConfiguration ? configuration?.nom : undefined)?.trim() || publique?.nom?.trim() || nomEcoleMemorise();

  useEffect(() => {
    if (nom !== NOM_PAR_DEFAUT) memoriser(nom);
    document.title = nom;
  }, [nom]);

  return nom;
}
