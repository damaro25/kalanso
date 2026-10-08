// Mock générique de PrismaService pour les tests unitaires.
// Chaque `prisma.<modele>.<methode>` est un jest.fn() créé à la demande ;
// `$transaction` accepte un tableau d'opérations ou un callback (transaction interactive).
export type PrismaMock = any;

export function createPrismaMock(): PrismaMock {
  const modeles: Record<string, Record<string, jest.Mock>> = {};

  const transaction = jest.fn(async (arg: unknown) => {
    if (Array.isArray(arg)) return Promise.all(arg);
    return (arg as (tx: unknown) => unknown)(prisma);
  });

  const prisma: PrismaMock = new Proxy(
    {},
    {
      get(_cible, prop: string) {
        if (prop === '$transaction') return transaction;
        if (prop === 'then') return undefined; // jamais traité comme une promesse
        if (!modeles[prop]) {
          const methodes: Record<string, jest.Mock> = {};
          modeles[prop] = new Proxy(methodes, {
            get(m, methode: string) {
              if (!(methode in m)) m[methode] = jest.fn();
              return m[methode];
            },
          });
        }
        return modeles[prop];
      },
    },
  );

  return prisma;
}

// Construit un Decimal-like : le code applicatif fait Number(x), un nombre suffit.
export const dec = (n: number) => n;

export function dateUTC(iso: string): Date {
  return new Date(iso);
}
