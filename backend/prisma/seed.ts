import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL as string });
const prisma = new PrismaClient({ adapter });

const DEMO_PASSWORD = 'kalanso2026';

async function main() {
  const ecole = await prisma.ecole.upsert({
    where: { id: 'ecole-demo' },
    update: {},
    create: {
      id: 'ecole-demo',
      nom: 'École La Cible du Formateur - Démo',
      ville: 'Conakry',
      email: 'demo@kalanso.gn',
    },
  });

  const anneeScolaire = await prisma.anneeScolaire.upsert({
    where: { ecoleId_libelle: { ecoleId: ecole.id, libelle: '2025-2026' } },
    update: {},
    create: {
      ecoleId: ecole.id,
      libelle: '2025-2026',
      dateDebut: new Date('2025-10-01'),
      dateFin: new Date('2026-07-31'),
      courante: true,
    },
  });

  const niveauxDefinitions = [
    { nom: 'CP1', cycle: 'Primaire', ordre: 1 },
    { nom: 'CP2', cycle: 'Primaire', ordre: 2 },
    { nom: 'CE1', cycle: 'Primaire', ordre: 3 },
    { nom: '6eme', cycle: 'College', ordre: 10 },
    { nom: '7eme', cycle: 'College', ordre: 11 },
  ];

  const niveaux: Awaited<ReturnType<typeof prisma.niveau.upsert>>[] = [];
  for (const def of niveauxDefinitions) {
    const niveau = await prisma.niveau.upsert({
      where: { ecoleId_nom: { ecoleId: ecole.id, nom: def.nom } },
      update: {},
      create: { ecoleId: ecole.id, ...def },
    });
    niveaux.push(niveau);
  }

  const classes: Awaited<ReturnType<typeof prisma.classe.upsert>>[] = [];
  for (const niveau of niveaux.slice(0, 3)) {
    const classe = await prisma.classe.upsert({
      where: {
        ecoleId_anneeScolaireId_nom: {
          ecoleId: ecole.id,
          anneeScolaireId: anneeScolaire.id,
          nom: `${niveau.nom} A`,
        },
      },
      update: {},
      create: {
        ecoleId: ecole.id,
        niveauId: niveau.id,
        anneeScolaireId: anneeScolaire.id,
        nom: `${niveau.nom} A`,
        capaciteMax: 40,
      },
    });
    classes.push(classe);
  }

  for (const niveau of niveaux) {
    await prisma.tarifEcolage.upsert({
      where: {
        ecoleId_niveauId_anneeScolaireId_libelle: {
          ecoleId: ecole.id,
          niveauId: niveau.id,
          anneeScolaireId: anneeScolaire.id,
          libelle: 'Ecolage annuel',
        },
      },
      update: {},
      create: {
        ecoleId: ecole.id,
        niveauId: niveau.id,
        anneeScolaireId: anneeScolaire.id,
        libelle: 'Ecolage annuel',
        montant: 1_500_000,
      },
    });
  }

  const motDePasseHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  const utilisateursDefinitions = [
    { role: 'FONDATEUR', nom: 'Camara', prenom: 'Fondateur', email: 'fondateur@kalanso.gn' },
    { role: 'CHEF_ETABLISSEMENT', nom: 'Diallo', prenom: 'Chef', email: 'chef@kalanso.gn' },
    { role: 'SECRETAIRE', nom: 'Bah', prenom: 'Secretaire', email: 'secretaire@kalanso.gn' },
    { role: 'COMPTABLE', nom: 'Toure', prenom: 'Comptable', email: 'comptable@kalanso.gn' },
    { role: 'ENSEIGNANT', nom: 'Sylla', prenom: 'Enseignant', email: 'enseignant@kalanso.gn' },
  ] as const;

  for (const def of utilisateursDefinitions) {
    await prisma.utilisateur.upsert({
      where: { email: def.email },
      update: {},
      create: {
        ecoleId: ecole.id,
        nom: def.nom,
        prenom: def.prenom,
        email: def.email,
        motDePasseHash,
        role: def.role,
      },
    });
  }

  const elevesDefinitions = [
    { nom: 'Kante', prenom: 'Aissatou', genre: 'F' as const, classeIndex: 0 },
    { nom: 'Barry', prenom: 'Mamadou', genre: 'M' as const, classeIndex: 0 },
    { nom: 'Conde', prenom: 'Fatoumata', genre: 'F' as const, classeIndex: 1 },
  ];

  for (const [i, def] of elevesDefinitions.entries()) {
    const eleve = await prisma.eleve.upsert({
      where: { ecoleId_matricule: { ecoleId: ecole.id, matricule: `ELV-00${i + 1}` } },
      update: {},
      create: {
        ecoleId: ecole.id,
        matricule: `ELV-00${i + 1}`,
        nom: def.nom,
        prenom: def.prenom,
        genre: def.genre,
      },
    });

    const classe = classes[def.classeIndex];
    await prisma.inscription.upsert({
      where: { eleveId_anneeScolaireId: { eleveId: eleve.id, anneeScolaireId: anneeScolaire.id } },
      update: {},
      create: {
        ecoleId: ecole.id,
        eleveId: eleve.id,
        classeId: classe.id,
        anneeScolaireId: anneeScolaire.id,
      },
    });
  }

  console.log('Seed terminé.');
  console.log(`Mot de passe de démo pour tous les comptes : ${DEMO_PASSWORD}`);
  for (const def of utilisateursDefinitions) {
    console.log(`  ${def.role.padEnd(20)} ${def.email}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
