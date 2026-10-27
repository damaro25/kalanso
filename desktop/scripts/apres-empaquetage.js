// electron-builder écarte toujours les dossiers node_modules des « extraResources » : on recopie ici les
// dépendances de production du backend embarqué, après l'empaquetage et avant la création de l'installateur.
const { cpSync } = require('node:fs');
const { join } = require('node:path');

exports.default = async function apresEmpaquetage(contexte) {
  const source = join(__dirname, '..', 'build', 'backend', 'node_modules');
  const destination = join(contexte.appOutDir, 'resources', 'backend', 'node_modules');
  cpSync(source, destination, { recursive: true });
  console.log(`  • dépendances du backend copiées dans ${destination}`);
};
