// Type d'opération d'un encaissement, déduit de la facture qu'il règle :
//   facture d'inscription  -> Inscription ou Réinscription (d'après son libellé)
//   facture d'écolage      -> Trimestre 1, 2 ou 3 si le libellé du tarif le dit (« Trimestre 1 »,
//                             « 2ème trimestre », « T3 »...), sinon Écolage
//   autre facture          -> Autre
export type TypeOperation =
  | 'Inscription'
  | 'Réinscription'
  | 'Écolage'
  | 'Trimestre 1'
  | 'Trimestre 2'
  | 'Trimestre 3'
  | 'Autre';

const MOTIFS_TRIMESTRE = [
  /trimestre\s*([123])\b/i, // « Trimestre 1 », « Écolage trimestre 2 »
  /\b([123])\s*(?:er|e|è|ème|eme)?\s*trimestre\b/i, // « 1er trimestre », « 2ème trimestre »
  /\bT\s*([123])\b/i, // « T1 », « Écolage T 3 »
];

export function typeOperation(facture: { type: string; libelle: string }): TypeOperation {
  if (facture.type === 'INSCRIPTION') {
    return /r[ée]inscription/i.test(facture.libelle) ? 'Réinscription' : 'Inscription';
  }
  if (facture.type === 'ECOLAGE') {
    for (const motif of MOTIFS_TRIMESTRE) {
      const m = motif.exec(facture.libelle);
      if (m) return `Trimestre ${m[1]}` as TypeOperation;
    }
    return 'Écolage';
  }
  return 'Autre';
}

// Les types qui comptent comme frais d'études sur le bordereau.
export function estFraisEtudes(type: TypeOperation): boolean {
  return type === 'Écolage' || type.startsWith('Trimestre');
}
