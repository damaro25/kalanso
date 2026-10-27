// « Reste à payer » détaillé du reçu : « 200.000T1 + 230.000T2 + T3 + T-shirt ». Un élément entamé est précédé de
// ce qu'il en reste ; un élément dont il reste tout le montant (rien n'y a été versé) s'écrit seul (T3).
// Ordre : inscription, tranches d'écolage, T-shirt, puis les autres factures.

export interface FactureDue {
  type: string;
  libelle: string;
  montantTotal: unknown;
  montantPaye: unknown;
}

const fmt = (n: number) => n.toLocaleString('fr-FR').replace(/[\s  ]/g, '.');

// « inscription » → « inscr. », « réinscription » → « reinscr. » (place limitée sur le ticket)
export function abregerInscription(texte: string): string {
  return texte.replace(/r[ée]inscription/gi, 'reinscr.').replace(/inscription/gi, 'inscr.');
}

function libelleCourt(f: FactureDue): { ordre: number; libelle: string } {
  if (f.type === 'INSCRIPTION') return { ordre: 0, libelle: /r[ée]inscription/i.test(f.libelle) ? 'reinscr.' : 'inscr.' };
  if (f.type === 'ECOLAGE') {
    const n = Number(/Tranche\s*(\d+)/i.exec(f.libelle)?.[1] ?? 0);
    return n ? { ordre: n, libelle: `T${n}` } : { ordre: 9, libelle: 'écolage' };
  }
  if (f.type === 'ASSURANCE') return { ordre: 20, libelle: 'T-shirt' };
  return { ordre: 30, libelle: abregerInscription(f.libelle) };
}

export function detailResteAPayer(factures: FactureDue[]): string {
  return factures
    .map((f) => ({ f, total: Number(f.montantTotal), paye: Number(f.montantPaye) }))
    .filter((x) => x.total > x.paye)
    .map((x) => ({ ...libelleCourt(x.f), reste: x.total - x.paye, entier: x.paye <= 0 }))
    .sort((a, b) => a.ordre - b.ordre)
    .map((x) => (x.entier ? x.libelle : `${fmt(x.reste)}${x.libelle}`))
    .join(' + ');
}

// « Pour » d'un reçu groupé (plusieurs éléments payés en une fois) : « insc + T-sh + T1 », dans l'ordre de la
// fenêtre Payer (inscription, T-shirt, tranches, autres).
export function pourGroupe(factures: { type: string; libelle: string }[]): string {
  const code = (f: { type: string; libelle: string }): { ordre: number; code: string } => {
    if (f.type === 'INSCRIPTION') return { ordre: 0, code: /r[ée]inscription/i.test(f.libelle) ? 'reinsc' : 'insc' };
    if (f.type === 'ASSURANCE') return { ordre: 1, code: 'T-sh' };
    if (f.type === 'ECOLAGE') {
      const n = Number(/Tranche\s*(\d+)/i.exec(f.libelle)?.[1] ?? 0);
      return { ordre: 10 + n, code: n ? `T${n}` : 'écolage' };
    }
    return { ordre: 30, code: abregerInscription(f.libelle) };
  };
  return factures
    .map(code)
    .sort((a, b) => a.ordre - b.ordre)
    .map((c) => c.code)
    .join(' + ');
}
