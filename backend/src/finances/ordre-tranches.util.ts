import { BadRequestException } from '@nestjs/common';

// Les tranches d'écolage se paient dans l'ordre : on ne peut rien verser sur une tranche tant qu'une tranche
// antérieure (même élève, même année) n'est pas soldée. « Antérieure » : échéance plus tôt, ou même échéance
// (ou aucune) et numéro de tranche plus petit (« … - Tranche 2 »).

type FactureTranche = { id: string; libelle: string; dateEcheance: Date | null };

const numeroTranche = (libelle: string) => Number(/Tranche\s*(\d+)/i.exec(libelle)?.[1] ?? 99);

export function estAnterieure(a: FactureTranche, b: FactureTranche): boolean {
  const ea = a.dateEcheance?.getTime() ?? Infinity;
  const eb = b.dateEcheance?.getTime() ?? Infinity;
  if (ea !== eb) return ea < eb;
  return numeroTranche(a.libelle) < numeroTranche(b.libelle);
}

type Client = {
  facture: {
    findMany: (args: any) => Promise<FactureTranche[]>;
  };
};

export async function exigerTranchesPrecedentesSoldees(
  prisma: Client,
  facture: FactureTranche & { type: string; ecoleId: string; eleveId: string; anneeScolaireId: string },
) {
  if (facture.type !== 'ECOLAGE') return;
  const impayees = await prisma.facture.findMany({
    where: {
      ecoleId: facture.ecoleId,
      eleveId: facture.eleveId,
      anneeScolaireId: facture.anneeScolaireId,
      type: 'ECOLAGE',
      statut: { in: ['IMPAYEE', 'PARTIELLE'] },
      id: { not: facture.id },
    },
    select: { id: true, libelle: true, dateEcheance: true },
  });
  const precedente = (impayees ?? []).filter((f) => estAnterieure(f, facture)).sort((a, b) => (estAnterieure(a, b) ? -1 : 1))[0];
  if (precedente) {
    throw new BadRequestException(`Soldez d'abord « ${precedente.libelle} » : les tranches se paient dans l'ordre.`);
  }
}
