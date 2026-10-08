// Stub commun de bcrypt / bcryptjs (web et desktop n'utilisent pas le même paquet).
export async function hash(motDePasse: string, _rounds?: number): Promise<string> {
  return `hashed:${motDePasse}`;
}

export async function compare(motDePasse: string, empreinte: string): Promise<boolean> {
  return empreinte === `hashed:${motDePasse}`;
}
