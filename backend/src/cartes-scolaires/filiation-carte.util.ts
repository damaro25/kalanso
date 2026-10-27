// Ligne « Filiation » des cartes (scolaire et de retrait) : « <père> et de <mère> », d'après les parents liés à
// l'élève (lien « Père » / « Mère »). Un seul des deux : son nom seul. Aucun : le contact principal (parent /
// tuteur saisi à l'admission). Rien : chaîne vide.

export interface LienParentCarte {
  lien: string;
  contactPrincipal: boolean;
  parentTuteur: { prenom: string | null; nom: string | null; telephone: string | null };
}

const nomComplet = (p: { prenom: string | null; nom: string | null }) => [p.prenom?.trim(), p.nom?.trim()].filter(Boolean).join(' ');

export function formaterFiliation(liens: LienParentCarte[] | null | undefined): string {
  const tous = liens ?? [];
  const pere = tous.find((l) => l.lien === 'Père');
  const mere = tous.find((l) => l.lien === 'Mère');
  const nomPere = pere ? nomComplet(pere.parentTuteur) : '';
  const nomMere = mere ? nomComplet(mere.parentTuteur) : '';
  if (nomPere && nomMere) return `${nomPere} et de ${nomMere}`;
  if (nomPere || nomMere) return nomPere || nomMere;
  const principal = tous.find((l) => l.contactPrincipal) ?? tous[0];
  return principal ? nomComplet(principal.parentTuteur) : '';
}

// Téléphone du contact principal, à défaut du premier parent qui en a un.
export function telephoneContact(liens: LienParentCarte[] | null | undefined): string | null {
  const tous = liens ?? [];
  const principal = tous.find((l) => l.contactPrincipal && l.parentTuteur.telephone);
  return (principal ?? tous.find((l) => l.parentTuteur.telephone))?.parentTuteur.telephone ?? null;
}

// « 626912827 » -> « 626 91 28 27 » (numéro guinéen à 9 chiffres) ; sinon le numéro tel quel.
export function formaterTelephone(telephone: string | null | undefined): string {
  if (!telephone) return '';
  const chiffres = telephone.replace(/\D/g, '');
  if (chiffres.length === 9) return `${chiffres.slice(0, 3)} ${chiffres.slice(3, 5)} ${chiffres.slice(5, 7)} ${chiffres.slice(7)}`;
  if (chiffres.length === 12 && chiffres.startsWith('224')) return `+224 ${formaterTelephone(chiffres.slice(3))}`;
  return telephone.trim();
}

// Classe de maternelle : cycle « Maternelle » / « Préscolaire » du niveau, ou niveau de crèche / garderie.
export function estMaternelle(niveau: { nom: string; cycle: string | null }): boolean {
  return /maternelle|pr[ée]scolaire/i.test(niveau.cycle ?? '') || /cr[eè]che|garderie|maternelle/i.test(niveau.nom);
}
