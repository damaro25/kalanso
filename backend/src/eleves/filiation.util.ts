// Filiation d'un élève : père et mère, enregistrés comme parents/tuteurs liés à l'élève (lien « Père » / « Mère »).
// Le parent / tuteur saisi à l'admission reste le contact principal (SMS, rappels).

export interface PersonneFiliation {
  prenom?: string | null;
  nom?: string | null;
  telephone?: string | null;
  profession?: string | null;
}

export type LienFiliation = 'Père' | 'Mère';

const propre = (v?: string | null) => v?.trim() || null;

// Nettoie une personne saisie ; null si ni prénom ni nom (rien à enregistrer).
export function personneSaisie(p?: PersonneFiliation | null): Required<PersonneFiliation> | null {
  if (!p) return null;
  const personne = {
    prenom: propre(p.prenom),
    nom: propre(p.nom),
    telephone: propre(p.telephone),
    profession: propre(p.profession),
  };
  return personne.prenom || personne.nom ? personne : null;
}

type Tx = {
  parentTuteur: { create: (args: any) => Promise<{ id: string }>; update: (args: any) => Promise<unknown> };
  eleveParent: {
    findFirst: (args: any) => Promise<{ id: string; parentTuteurId: string } | null>;
    create: (args: any) => Promise<unknown>;
    delete: (args: any) => Promise<unknown>;
  };
};

// Enregistre (ou met à jour) le père ou la mère de l'élève ; personne null : le lien est retiré.
export async function enregistrerFiliation(
  tx: Tx,
  ecoleId: string,
  eleveId: string,
  lien: LienFiliation,
  saisie: PersonneFiliation | null | undefined,
) {
  const personne = personneSaisie(saisie);
  const existant = await tx.eleveParent.findFirst({ where: { eleveId, lien } });
  if (!personne) {
    if (existant) await tx.eleveParent.delete({ where: { id: existant.id } });
    return;
  }
  const data = {
    prenom: personne.prenom ?? '',
    nom: personne.nom ?? '',
    telephone: personne.telephone,
    profession: personne.profession,
  };
  if (existant) {
    await tx.parentTuteur.update({ where: { id: existant.parentTuteurId }, data });
    return;
  }
  const parent = await tx.parentTuteur.create({ data: { ecoleId, ...data } });
  await tx.eleveParent.create({ data: { eleveId, parentTuteurId: parent.id, lien, contactPrincipal: false } });
}
