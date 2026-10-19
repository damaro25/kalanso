import { BadRequestException } from '@nestjs/common';

// Une année clôturée (Finances > Clôture d'année) est figée : plus de nouvelles factures, d'inscriptions ni de
// modification de ses tarifs. Les paiements de ses factures (arriérés) restent possibles.
type ClientAnnee = { anneeScolaire: { findUnique: (args: any) => Promise<{ cloturee?: boolean; libelle?: string } | null> } };

export async function anneeEstCloturee(prisma: ClientAnnee, anneeScolaireId: string | null | undefined): Promise<boolean> {
  if (!anneeScolaireId) return false;
  const annee = await prisma.anneeScolaire.findUnique({ where: { id: anneeScolaireId } });
  return !!annee?.cloturee;
}

export async function exigerAnneeOuverte(prisma: ClientAnnee, anneeScolaireId: string | null | undefined, action = 'modifier') {
  if (!anneeScolaireId) return;
  const annee = await prisma.anneeScolaire.findUnique({ where: { id: anneeScolaireId } });
  if (annee?.cloturee) {
    const de = /^[aeiouyéèêh]/i.test(action) ? "d'" : 'de ';
    throw new BadRequestException(
      `L'année ${annee.libelle ?? ''} est clôturée : impossible ${de}${action}. Seuls les paiements de ses factures restent possibles.`,
    );
  }
}
