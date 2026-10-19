// Modules désactivés à la demande du fondateur : retirés du menu, leurs pages renvoient ailleurs. Le code et les
// données sont conservés ; passer la valeur à false réactive le module.
export const MODULES_DESACTIVES = {
  admissions: true, // demandes d'admission (l'ajout d'un élève reste possible : Élèves > Nouvel élève)
  bilanFinancier: true, // page Finances > Bilan financier (/finance)
  paiementInscription: true, // entrée de menu Finances > Paiement inscription/réinscription (page toujours accessible)
  paiementAssurance: true, // entrée de menu Finances > Paiement T-shirt (page toujours accessible)
  assurance: true, // page Finances > Assurance (montants, facturation, suivi) ; « Paiement T-shirt » reste actif
};
