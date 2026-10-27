import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ClotureService, ajuster, libelleSuivant } from './cloture.service';
import { FacturesService } from '../finances/factures.service';
import { TarifsEcolageService } from '../finances/tarifs-ecolage.service';

// Petite base en mémoire : assez de Prisma pour la clôture (where simples, OR, in/not/lt, includes), et une
// transaction qui annule tout en cas d'erreur, comme PostgreSQL.
function baseEnMemoire(donnees: Record<string, any[]>) {
  let tables: Record<string, any[]> = structuredClone(donnees);
  let seq = 0;
  const correspond = (ligne: any, where: any = {}): boolean =>
    Object.entries(where).every(([k, v]: [string, any]) => {
      if (v === undefined) return true;
      if (k === 'OR') return v.some((w: any) => correspond(ligne, w));
      if (k === 'eleve' || k === 'formation') return true; // relations : non filtrées ici
      if (k === 'facture') return tables.facture.some((f) => f.id === ligne.factureId && correspond(f, v));
      const val = ligne[k];
      if (v !== null && typeof v === 'object' && !(v instanceof Date)) {
        if ('in' in v) return v.in.includes(val);
        if ('not' in v) return v.not === null ? val !== null && val !== undefined : val !== v.not;
        if ('lt' in v) return val < v.lt;
        return true;
      }
      return (val ?? null) === v;
    });
  const inclure = (modele: string, ligne: any, include?: any) => {
    if (!include) return ligne;
    const r = { ...ligne };
    if (include.eleve) r.eleve = tables.eleve.find((e) => e.id === ligne.eleveId);
    if (include.classe) r.classe = tables.classe.find((c) => c.id === ligne.classeId);
    return r;
  };
  const modele = (nom: string) => ({
    findMany: async ({ where, include }: any = {}) => tables[nom].filter((l) => correspond(l, where)).map((l) => inclure(nom, l, include)),
    findFirst: async ({ where, include }: any = {}) => {
      const l = tables[nom].find((x) => correspond(x, where));
      return l ? inclure(nom, l, include) : null;
    },
    findUnique: async ({ where }: any) => {
      if (where.id) return tables[nom].find((x) => x.id === where.id) ?? null;
      const cle = Object.values(where)[0] as any;
      return tables[nom].find((x) => correspond(x, cle)) ?? null;
    },
    findFirstOrThrow: async ({ where }: any) => {
      const l = tables[nom].find((x) => correspond(x, where));
      if (!l) throw new Error(`${nom} introuvable`);
      return l;
    },
    create: async ({ data }: any) => {
      const l = { id: `${nom}-${++seq}`, createdAt: new Date(), ...data };
      tables[nom].push(l);
      return l;
    },
    update: async ({ where, data }: any) => {
      const l = tables[nom].find((x) => x.id === where.id);
      Object.assign(l, data);
      return l;
    },
    updateMany: async ({ where, data }: any) => {
      const ls = tables[nom].filter((x) => correspond(x, where));
      ls.forEach((l) => Object.assign(l, data));
      return { count: ls.length };
    },
    count: async ({ where }: any = {}) => tables[nom].filter((l) => correspond(l, where)).length,
    aggregate: async ({ where }: any) => {
      const ls = tables[nom].filter((l) => correspond(l, where));
      return { _count: ls.length, _sum: { montant: ls.reduce((t, l) => t + Number(l.montant), 0) } };
    },
  });
  const client: any = new Proxy(
    {},
    {
      get(_c, prop: string) {
        if (prop === 'tables') return tables;
        if (prop === '$transaction')
          return async (fn: any) => {
            const avant = structuredClone(tables);
            try {
              return await fn(client);
            } catch (e) {
              tables = avant; // ROLLBACK
              throw e;
            }
          };
        if (prop === 'then') return undefined;
        tables[prop] ??= [];
        return modele(prop);
      },
    },
  );
  return client;
}

const A = { id: 'a1', ecoleId: 'ecole', libelle: '2026-2027', dateDebut: new Date('2026-10-05T00:00:00Z'), dateFin: new Date('2027-06-05T00:00:00Z'), courante: true, cloturee: false };
const donnees = () => ({
  anneeScolaire: [A],
  niveau: [
    { id: 'n1', ecoleId: 'ecole', nom: '1ère année', ordre: 1 },
    { id: 'n2', ecoleId: 'ecole', nom: '2ème année', ordre: 2 },
    { id: 'n3', ecoleId: 'ecole', nom: '6ème année', ordre: 3 }, // dernière classe
  ],
  classe: [
    { id: 'c1', ecoleId: 'ecole', nom: '1ère année', niveauId: 'n1', anneeScolaireId: 'a1', actif: true, capaciteMax: null },
    { id: 'c2', ecoleId: 'ecole', nom: '2ème année', niveauId: 'n2', anneeScolaireId: 'a1', actif: true, capaciteMax: null },
    { id: 'c3', ecoleId: 'ecole', nom: '6ème année', niveauId: 'n3', anneeScolaireId: 'a1', actif: true, capaciteMax: null },
  ],
  tarifEcolage: [
    { id: 't1', ecoleId: 'ecole', niveauId: 'n2', anneeScolaireId: 'a1', libelle: 'Externat - Tranche 1', regime: 'EXTERNAT', montant: 500000, dateEcheance: null },
    { id: 't2', ecoleId: 'ecole', niveauId: 'n2', anneeScolaireId: 'a1', libelle: 'Externat - Tranche 2', regime: 'EXTERNAT', montant: 400000, dateEcheance: new Date('2027-01-06T00:00:00Z') },
    { id: 't3', ecoleId: 'ecole', niveauId: 'n2', anneeScolaireId: 'a1', libelle: 'Internat - Tranche 1', regime: 'INTERNAT', montant: 3500000, dateEcheance: null },
  ],
  fraisInscriptionNiveau: [{ id: 'fr2', ecoleId: 'ecole', niveauId: 'n2', anneeScolaireId: 'a1', montant: 100000, montantReinscription: 50000 }],
  eleve: [
    { id: 'e1', ecoleId: 'ecole', prenom: 'Laby', nom: 'CAMARA', actif: true },
    { id: 'e2', ecoleId: 'ecole', prenom: 'Fatoumata', nom: 'CAMARA', actif: true },
    { id: 'e3', ecoleId: 'ecole', prenom: 'Mariama', nom: 'BAH', actif: true },
  ],
  inscription: [
    { id: 'i1', ecoleId: 'ecole', eleveId: 'e1', classeId: 'c1', anneeScolaireId: 'a1', statut: 'EN_COURS', regime: 'EXTERNAT' },
    { id: 'i2', ecoleId: 'ecole', eleveId: 'e2', classeId: 'c1', anneeScolaireId: 'a1', statut: 'EN_COURS', regime: 'INTERNAT' },
    { id: 'i3', ecoleId: 'ecole', eleveId: 'e3', classeId: 'c3', anneeScolaireId: 'a1', statut: 'EN_COURS', regime: 'EXTERNAT' },
  ],
  facture: [{ id: 'f1', ecoleId: 'ecole', eleveId: 'e1', anneeScolaireId: 'a1', type: 'ECOLAGE', libelle: 'Externat - Tranche 1', statut: 'PARTIELLE', montantTotal: 500000, montantPaye: 300000 }],
  paiement: [{ id: 'p1', ecoleId: 'ecole', factureId: 'f1', montant: 300000 }],
  fraisInscriptionNiveauB: [],
});

describe('ClotureService (clôture d’année et initialisation de la suivante)', () => {
  let db: any;
  let service: ClotureService;

  beforeEach(() => {
    db = baseEnMemoire(donnees());
    service = new ClotureService(db);
    jest.spyOn(service, 'coherence').mockResolvedValue({ facturesIncoherentes: 0, sansNumero: 0, doublons: 0 });
    jest.spyOn(service, 'sauvegarder').mockResolvedValue('sauvegardes/avant-cloture.sql');
  });

  it('libellé et ajustement', () => {
    expect(libelleSuivant('2026-2027', A.dateDebut)).toBe('2027-2028');
    expect(ajuster(500000, 5)).toBe(525000);
    expect(ajuster(333333, 0)).toBe(333333);
  });

  it('aperçu : contrôles et plan chiffré, sans rien modifier', async () => {
    const avant = JSON.stringify(db.tables);
    const { controles, plan } = await service.apercu('ecole', {});

    expect(controles).toMatchObject({ impayes: { nombre: 1, reste: 200000 }, paiements: { nombre: 1, total: 300000 }, elevesInscrits: 3, bloquant: false });
    expect(plan.anneeSuivante).toMatchObject({ libelle: '2027-2028', aCreer: true, dateDebut: '2027-10-05', dateFin: '2028-06-05' });
    expect(plan).toMatchObject({ classesACreer: 3, tarifsACreer: 3, fraisACreer: 1, reinscriptions: 2, dejaReinscrits: 0 });
    expect(plan.reinscriptionsParClasse).toEqual([{ origine: '1ère année', destination: '2ème année', eleves: 2 }]);
    expect(plan.sortants).toEqual([{ nom: 'Mariama BAH', classe: '6ème année' }]); // dernière classe : sortante
    // Laby (externat) : 50 000 + 500 000 + 400 000 ; Fatoumata (internat) : 50 000 + 3 500 000
    expect(plan.totalFacturePrevu).toBe(950000 + 3550000);
    expect(JSON.stringify(db.tables)).toBe(avant);
  });

  it('exige le code de sécurité', async () => {
    await expect(service.executer('ecole', {}, 'u1')).rejects.toThrow(ForbiddenException);
    await expect(service.executer('ecole', { code: '1234' }, 'u1')).rejects.toThrow('Code incorrect');
    expect(db.tables.anneeScolaire).toHaveLength(1);
  });

  it("exécute tout : année suivante, classes, tarifs décalés d'un an, réinscriptions, factures, année courante, clôture", async () => {
    const r = await service.executer('ecole', { code: '2026' }, 'u-fondateur');
    const t = db.tables;
    const B = t.anneeScolaire.find((a: any) => a.libelle === '2027-2028');

    expect(B.courante).toBe(true);
    expect(t.anneeScolaire.find((a: any) => a.id === 'a1')).toMatchObject({ courante: false, cloturee: true, clotureParId: 'u-fondateur' });
    expect(t.classe.filter((c: any) => c.anneeScolaireId === B.id)).toHaveLength(3);
    const tranche2 = t.tarifEcolage.find((x: any) => x.anneeScolaireId === B.id && x.libelle === 'Externat - Tranche 2');
    expect(tranche2.dateEcheance).toEqual(new Date('2028-01-06T00:00:00Z'));
    expect(t.inscription.filter((i: any) => i.anneeScolaireId === 'a1').map((i: any) => i.statut)).toEqual(['TERMINEE', 'TERMINEE', 'TERMINEE']);
    const nouvelles = t.inscription.filter((i: any) => i.anneeScolaireId === B.id);
    expect(nouvelles.map((i: any) => [i.eleveId, i.regime])).toEqual([['e1', 'EXTERNAT'], ['e2', 'INTERNAT']]); // e3 sortante
    const facturesB = t.facture.filter((f: any) => f.anneeScolaireId === B.id);
    expect(facturesB.reduce((s: number, f: any) => s + Number(f.montantTotal), 0)).toBe(4500000);
    expect(r).toMatchObject({ facturesCreees: facturesB.length, sauvegarde: 'sauvegardes/avant-cloture.sql' });
    // l'année clôturée garde ses factures et paiements
    expect(t.facture.filter((f: any) => f.anneeScolaireId === 'a1')).toHaveLength(1);
    expect(t.paiement).toHaveLength(1);
  });

  it('idempotente : relancée, elle ne crée aucun doublon', async () => {
    await service.executer('ecole', { code: '2026' }, 'u1');
    const compter = () => ['anneeScolaire', 'classe', 'tarifEcolage', 'fraisInscriptionNiveau', 'inscription', 'facture'].map((m) => db.tables[m].length);
    const apres1 = compter();
    // relance sur la même année (désormais clôturée), vers la même année suivante
    await service.executer('ecole', { code: '2026', anneeId: 'a1' }, 'u1');
    expect(compter()).toEqual(apres1);
  });

  it('tout ou rien : une erreur au milieu annule toute la clôture', async () => {
    const base = db;
    const facturesCreate = base.facture.create;
    let appels = 0;
    const tablesAvant = JSON.stringify(base.tables);
    jest.spyOn(FacturesService.prototype, 'genererFacturesEnrolement').mockImplementation(async () => {
      if (++appels === 2) throw new Error('panne pendant la facturation');
    });
    await expect(service.executer('ecole', { code: '2026' }, 'u1')).rejects.toThrow('panne');
    expect(JSON.stringify(base.tables)).toBe(tablesAvant);
    expect(facturesCreate).toBeDefined();
    (FacturesService.prototype.genererFacturesEnrolement as jest.Mock).mockRestore();
  });

  it('bloque si une facture a un montant payé différent de ses paiements', async () => {
    (service.coherence as jest.Mock).mockResolvedValue({ facturesIncoherentes: 2, sansNumero: 0, doublons: 0 });
    await expect(service.executer('ecole', { code: '2026' }, 'u1')).rejects.toThrow('Clôture impossible');
    expect(db.tables.anneeScolaire).toHaveLength(1);
  });

  it('sans sauvegarde automatique possible : refuse, sauf si on choisit de continuer', async () => {
    (service.sauvegarder as jest.Mock).mockRejectedValue(new Error('pg_dump introuvable'));
    await expect(service.executer('ecole', { code: '2026' }, 'u1')).rejects.toThrow(BadRequestException);
    expect(db.tables.anneeScolaire).toHaveLength(1);
    const r = await service.executer('ecole', { code: '2026', sansSauvegarde: true }, 'u1');
    expect(r.sauvegarde).toBeNull();
  });

  it('options : tarifs ajustés de +10 %, sans réinscription ni changement d’année courante', async () => {
    await service.executer('ecole', { code: '2026', tarifs: 'AJUSTES', ajustementPct: 10, reinscrire: false, rendreCourante: false }, 'u1');
    const B = db.tables.anneeScolaire.find((a: any) => a.libelle === '2027-2028');
    expect(db.tables.tarifEcolage.find((x: any) => x.anneeScolaireId === B.id && x.libelle === 'Externat - Tranche 1').montant).toBe(550000);
    expect(db.tables.inscription.filter((i: any) => i.anneeScolaireId === B.id)).toHaveLength(0);
    expect(B.courante).toBeFalsy();
    expect(db.tables.anneeScolaire.find((a: any) => a.id === 'a1')).toMatchObject({ courante: true, cloturee: true });
  });

  it("une année clôturée n'accepte plus de factures ni de tarifs", async () => {
    await service.executer('ecole', { code: '2026' }, 'u1');
    await expect(new FacturesService(db).create('ecole', { eleveId: 'e1', libelle: 'Cantine', montantTotal: 1000, anneeScolaireId: 'a1' } as any)).rejects.toThrow('clôturée');
    await expect(
      new TarifsEcolageService(db).create('ecole', { niveauId: 'n2', anneeScolaireId: 'a1', libelle: 'X', montant: 1 } as any),
    ).rejects.toThrow('clôturée');
    const avant = db.tables.facture.length;
    await new FacturesService(db).genererFacturesEnrolement('ecole', 'e1', 'c1', 'a1');
    expect(db.tables.facture.length).toBe(avant); // aucune facture générée sur l'année clôturée
  });
});
