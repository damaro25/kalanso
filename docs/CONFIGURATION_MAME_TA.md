# Configuration Mamé-TA (année 2025-2026)

Source : fiche de renseignements 2025-2026 des Écoles Mamé-TA (version avec horaires et maillot de sport).

## Ce que l'application gère désormais

- **Régime de l'élève** (externat, semi-internat, internat, pensionnat), choisi à l'acceptation d'une admission
  ou sur la fiche de l'élève (« Affecter à une classe »). Il est conservé lors du passage en classe supérieure.
- **Tarifs par régime** : un tarif d'écolage peut être lié à un régime ; il n'est alors facturé qu'aux élèves de
  ce régime. Sans régime, il s'applique à tous (cas de la crèche/garderie).
- **Échéances** : un tarif peut porter une date d'échéance, reportée sur la facture (6 janvier, 10 avril).
- **Changement de régime en cours d'année** : les factures d'écolage de l'ancien régime passent « annulée » et
  celles du nouveau sont émises. Refusé si un paiement a déjà été encaissé sur l'ancien régime.
- **Pièces d'admission** : « Carnet de vaccination » et « Livret scolaire » ajoutés aux types de documents.

## Écran Configuration (Établissement › Configuration)

- **Coordonnées** de l'école (nom, sigle, téléphone, email, ville) : direction uniquement.
- **Grille tarifaire** d'une année : un onglet par régime (plus « Tous régimes ») avec les trois tranches de
  chaque niveau et leur total, un onglet « Inscription » pour les frais d'inscription et de réinscription, et
  l'échéance de chaque tranche. Rien n'est enregistré avant « Enregistrer la grille » ; une case vidée
  supprime la tranche. Accessible à la direction et au comptable.
- **Charger la fiche Mamé-TA 2025-2026** (direction) : remplit d'un coup coordonnées, année, niveaux (une
  classe par niveau), frais et grille de la fiche ci-dessous. On peut ensuite tout ajuster dans la grille.

Les factures déjà émises ne changent pas : après une modification, « Régénérer les factures manquantes »
(Bilan financier) facture les élèves déjà inscrits.

## Mise en place

```bash
cd backend
npx prisma migrate deploy                    # ajoute régimes, échéances et nouveaux types de pièces
npx prisma generate
# si l'école n'existe pas encore : prisma/scripts/preparer-base-pour-une-ecole.sql
```

Puis, dans l'application : Établissement › Configuration › « Charger la fiche Mamé-TA 2025-2026 ». Le même
chargement existe en ligne de commande : `ECOLE_ID=<identifiant> npx tsx prisma/scripts/configurer-mame-ta.ts`.

## Données chargées par le script

- École : Les Écoles Mamé-TA, tél. +224 622 14 91 07 / 655 54 07 03 / 628 04 66 12, mametahold016@gmail.com
- Année 2025-2026 : du 1er octobre 2025 au 30 juin 2026
- Niveaux (une classe du même nom par niveau) : Crèche / Garderie, PS, MS, GS, 1ère à 6ème année
- Frais d'inscription 100 000 GNF, réinscription 50 000 GNF (tous niveaux)

Écolage en GNF (tranche 1 à l'inscription, tranche 2 au 6 janvier, tranche 3 au 10 avril) :

| Niveau | Régime | Total | Tranche 1 | Tranche 2 | Tranche 3 |
|---|---|---:|---:|---:|---:|
| Crèche / Garderie | tous | 3 500 000 | 2 500 000 | 500 000 | 500 000 |
| PS / MS / GS | Externat | 1 100 000 | 500 000 | 400 000 | 200 000 |
| PS / MS / GS | Semi-internat | 4 000 000 | 2 500 000 | 1 000 000 | 500 000 |
| PS / MS / GS | Internat | 5 000 000 | 2 500 000 | 2 000 000 | 500 000 |
| 1ère et 2ème année | Externat | 1 200 000 | 500 000 | 500 000 | 200 000 |
| 3ème et 4ème année | Externat | 1 300 000 | 600 000 | 400 000 | 300 000 |
| 5ème et 6ème année | Externat | 1 500 000 | 700 000 | 500 000 | 300 000 |
| 1ère à 6ème année | Semi-internat | 5 000 000 | 3 000 000 | 1 500 000 | 500 000 |
| 1ère à 6ème année | Internat | 6 500 000 | 3 500 000 | 2 500 000 | 500 000 |
| PS à 6ème année | Pensionnat | 9 750 000 | 6 500 000 | 3 250 000 | — |

## Non automatisé (à saisir comme factures ponctuelles ou à trancher)

- T-shirt Mamé-TA 50 000 GNF, maillot de sport 60 000 GNF, kit fournitures (voir la direction)
- Cours optionnels pour l'externat : arabe 25 000 GNF/mois, informatique 50 000 GNF/mois
  (gratuits en internat et semi-internat ; anglais gratuit et obligatoire au primaire)
- Réduction de 10 % pour un paiement annuel en une fois
- Denrées à apporter (internat : 2 sacs de riz, 10 L d'huile, 2 cartons de savon, 2 cartons de lait ;
  semi-internat : 1 sac de riz, 5 L d'huile, 1 sac de savon en poudre)
