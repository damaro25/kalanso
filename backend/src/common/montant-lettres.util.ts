// Montant en toutes lettres (français), pour la ligne « La somme de » des reçus : 850000 → « huit cent cinquante mille ».
const UNITES = [
  'zéro', 'un', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit', 'neuf', 'dix',
  'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize', 'dix-sept', 'dix-huit', 'dix-neuf',
];
const DIZAINES = ['', '', 'vingt', 'trente', 'quarante', 'cinquante', 'soixante', 'soixante', 'quatre-vingt', 'quatre-vingt'];

function moinsDeCent(n: number): string {
  if (n < 20) return UNITES[n];
  const d = Math.floor(n / 10);
  let u = n % 10;
  if (d === 7 || d === 9) u += 10; // soixante-dix, quatre-vingt-dix
  const base = DIZAINES[d];
  if (u === 0) return d === 8 ? 'quatre-vingts' : base;
  if (u === 1 && d !== 8 && d !== 9) return `${base} et un`;
  if (u === 11 && d === 7) return `${base} et onze`;
  return `${base}-${UNITES[u]}`;
}

function moinsDeMille(n: number): string {
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c === 0) return moinsDeCent(r);
  const cent = c === 1 ? 'cent' : `${UNITES[c]} cent${r === 0 ? 's' : ''}`;
  return r === 0 ? cent : `${cent} ${moinsDeCent(r)}`;
}

export function montantEnLettres(montant: number): string {
  let n = Math.round(Math.abs(montant));
  if (n === 0) return 'zéro';
  const morceaux: string[] = [];
  const echelles: [number, string, string][] = [
    [1_000_000_000, 'milliard', 'milliards'],
    [1_000_000, 'million', 'millions'],
  ];
  for (const [valeur, singulier, pluriel] of echelles) {
    const q = Math.floor(n / valeur);
    if (q) {
      morceaux.push(`${moinsDeMille(q)} ${q > 1 ? pluriel : singulier}`);
      n %= valeur;
    }
  }
  const milliers = Math.floor(n / 1000);
  if (milliers) {
    // « mille » est invariable et ne prend pas « un » devant ; « cents » perd son s devant mille
    morceaux.push(milliers === 1 ? 'mille' : `${moinsDeMille(milliers).replace(/cents$/, 'cent')} mille`);
    n %= 1000;
  }
  if (n) morceaux.push(moinsDeMille(n));
  return morceaux.join(' ');
}
