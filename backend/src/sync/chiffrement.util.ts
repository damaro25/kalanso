import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

// Chiffrement du mot de passe du compte de synchronisation, enregistré sur le PC (AES-256-GCM). La clé dérive du
// secret propre au poste (SYNC_CLE, sinon JWT_SECRET, que la version bureau génère au premier lancement).
function cle(): Buffer {
  const secret = process.env.SYNC_CLE || process.env.JWT_SECRET;
  if (!secret) throw new Error('Aucun secret disponible pour chiffrer le mot de passe');
  return createHash('sha256').update(`mameta-sync:${secret}`).digest();
}

export function chiffrer(texte: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', cle(), iv);
  const donnees = Buffer.concat([c.update(texte, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), donnees].map((b) => b.toString('base64')).join('.');
}

export function dechiffrer(valeur: string): string {
  const [iv, tag, donnees] = valeur.split('.').map((p) => Buffer.from(p, 'base64'));
  const d = createDecipheriv('aes-256-gcm', cle(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(donnees), d.final()]).toString('utf8');
}
