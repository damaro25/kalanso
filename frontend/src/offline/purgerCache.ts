import { getQueryClient } from './queryClientRef';
import { queryPersister } from './queryPersister';

// Le cache des requêtes est conservé 24 h sur l'appareil pour le mode hors ligne. Il appartient à la personne connectée :
// sans le vider, un enseignant qui ouvre sa session sur le poste de la direction retrouverait ses données (tous les
// élèves, les finances...) le temps du premier chargement, ou hors connexion. On le vide donc à chaque ouverture et
// fermeture de session. Les actions en attente de synchronisation (file d'attente) ne sont pas touchées.
export async function purgerCacheUtilisateur(): Promise<void> {
  try {
    getQueryClient().clear();
  } catch {
    // client de requêtes pas encore initialisé : rien à vider en mémoire
  }
  try {
    await queryPersister.removeClient();
  } catch {
    // stockage local indisponible (navigation privée...) : il n'y a alors rien de persistant à vider
  }
}
