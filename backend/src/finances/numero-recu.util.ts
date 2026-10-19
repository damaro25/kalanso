// N° de reçu tel qu'imprimé : le numéro séquentiel de l'école sur 6 chiffres (« 001480 »). Les reçus émis par un
// poste bureau synchronisé ont leur propre série : poste n = numéros n × 1 000 000 + k, imprimés « Bn-00000k ».
// Un paiement sans numéro (base pas encore migrée) garde son identifiant.
export const TAILLE_SERIE_POSTE = 1_000_000;

export function formaterNumeroRecu(paiement: { id: string; numero?: number | null }): string {
  if (paiement.numero == null) return paiement.id;
  if (paiement.numero >= TAILLE_SERIE_POSTE) {
    const poste = Math.floor(paiement.numero / TAILLE_SERIE_POSTE);
    return `B${poste}-${String(paiement.numero % TAILLE_SERIE_POSTE).padStart(6, '0')}`;
  }
  return String(paiement.numero).padStart(6, '0');
}
