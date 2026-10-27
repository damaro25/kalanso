import { origineAutorisee } from './cors';

const accepte = (origine?: string) => {
  let resultat: boolean | undefined;
  origineAutorisee(origine, (_e, ok) => (resultat = ok));
  return resultat;
};

describe('CORS : cette machine et le réseau local seulement', () => {
  it('accepte localhost et les adresses privées du réseau local, sur tout port', () => {
    for (const o of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://192.168.1.67:5173', 'http://10.0.0.5:5173', 'http://172.20.3.4:5173']) {
      expect(accepte(o)).toBe(true);
    }
  });

  it('refuse les autres sites (Internet)', () => {
    for (const o of ['https://exemple.com', 'http://8.8.8.8:5173', 'http://172.32.0.1:5173', 'http://192.168.1.67.exemple.com']) {
      expect(accepte(o)).toBe(false);
    }
  });

  it("accepte un appel sans en-tête Origin (même origine, outils)", () => {
    expect(accepte(undefined)).toBe(true);
  });
});
