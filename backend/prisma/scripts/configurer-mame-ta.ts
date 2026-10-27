// Même effet que le bouton « Charger la fiche Mamé-TA 2025-2026 » de l'écran Configuration, en ligne de
// commande : coordonnées, année 2025-2026, niveaux (une classe par niveau), frais d'inscription et grille
// tarifaire par régime (données dans src/configuration/modele-mame-ta.ts).
//
// À lancer après preparer-base-pour-une-ecole.sql (l'école et son compte fondateur doivent exister) :
//
//   ECOLE_ID=<identifiant de l'école> npx tsx prisma/scripts/configurer-mame-ta.ts
//
// Relançable : rien n'est supprimé hors des tranches de la grille. Les factures déjà émises ne sont pas
// modifiées ; « Régénérer les factures manquantes » facture ensuite les élèves déjà inscrits.
import 'dotenv/config';
import { PrismaService } from '../../src/prisma/prisma.service';
import { ConfigurationService } from '../../src/configuration/configuration.service';

const prisma = new PrismaService();

async function main() {
  const ecoleId = process.env.ECOLE_ID;
  if (!ecoleId) {
    throw new Error("Indiquez l'identifiant de l'école : ECOLE_ID=<identifiant> npx tsx prisma/scripts/configurer-mame-ta.ts");
  }
  if (!(await prisma.ecole.findUnique({ where: { id: ecoleId } }))) {
    throw new Error(`École « ${ecoleId} » introuvable : lancez d'abord preparer-base-pour-une-ecole.sql.`);
  }

  const grille = await new ConfigurationService(prisma).chargerModeleMameTa(ecoleId);
  const nbTranches = grille.niveaux.reduce(
    (acc, n) => acc + Object.values(n.tarifs).flat().filter((m) => m).length,
    0,
  );
  console.log(`Fiche Mamé-TA chargée : ${grille.niveaux.length} niveaux, ${nbTranches} tranches d'écolage.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
