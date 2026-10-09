// Code à 4 chiffres demandé avant de supprimer une dépense : une suppression fait disparaître une sortie d'argent
// des comptes, elle ne doit pas se faire par un simple clic. Le contrôle est côté serveur (l'écran ne fait que
// demander le code). `CODE_SUPPRESSION_DEPENSE` dans l'environnement permet de le changer sans recompiler.
export const CODE_SUPPRESSION_PAR_DEFAUT = '2026';

export function codeSuppressionValide(saisi?: string): boolean {
  const attendu = process.env.CODE_SUPPRESSION_DEPENSE?.trim() || CODE_SUPPRESSION_PAR_DEFAUT;
  return typeof saisi === 'string' && saisi.trim() === attendu;
}
