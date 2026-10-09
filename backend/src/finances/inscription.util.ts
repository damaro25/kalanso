// Règles communes aux frais d'inscription : utilisées à l'admission (génération de la facture,
// toujours impayée) et au paiement de l'inscription / de la réinscription.

interface FraisInscriptionNiveau {
  montant: unknown;
  montantReinscription?: unknown;
}

// Montant dû pour un élève : le tarif de réinscription s'il en a un (sinon le tarif nouveaux)
// pour un élève qui revient, le tarif nouveaux pour un nouvel élève. 0 si aucun frais n'est défini.
export function montantFraisInscription(frais: FraisInscriptionNiveau | null | undefined, estReinscription: boolean): number {
  if (!frais) return 0;
  return Number((estReinscription ? frais.montantReinscription : null) ?? frais.montant);
}

export function libelleFraisInscription(estReinscription: boolean, classeNom: string): string {
  return `Frais ${estReinscription ? 'de réinscription' : "d'inscription"} - ${classeNom}`;
}
