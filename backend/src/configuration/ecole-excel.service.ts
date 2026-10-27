import { BadRequestException, Injectable } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import { ConfigurationService } from './configuration.service';
import type { UpdateEcoleDto } from './dto/configuration.dto';

// Import / export Excel des coordonnées de l'école (écran Configuration, section du haut) : une feuille
// « Coordonnées » à deux colonnes, Champ | Valeur. Un fichier exporté peut être modifié puis réimporté tel quel ;
// l'import passe par ConfigurationService.updateEcole (mêmes règles qu'à l'écran).

type Cle = Exclude<keyof UpdateEcoleDto, never>;

const CHAMPS: { cle: Cle; libelle: string }[] = [
  { cle: 'nom', libelle: "Nom de l'école" },
  { cle: 'sigle', libelle: 'Sigle' },
  { cle: 'telephone', libelle: 'Téléphone' },
  { cle: 'email', libelle: 'Email' },
  { cle: 'ville', libelle: 'Ville' },
  { cle: 'nomDirecteur', libelle: 'Directeur Général' },
  { cle: 'nomComptable', libelle: 'Percepteur-Comptable' },
  { cle: 'numeroRecuDepart', libelle: 'Numéroter les reçus à partir de' },
  { cle: 'carteRetraitMinistere', libelle: 'Cartes de retrait : Ministère' },
  { cle: 'carteRetraitDev', libelle: 'Cartes de retrait : DEV' },
  { cle: 'carteRetraitDce', libelle: 'Cartes de retrait : DCE' },
  { cle: 'carteRetraitSignataire', libelle: 'Cartes de retrait : Signataire' },
];

const normaliser = (v: string) =>
  v
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

function texte(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object' && !(v instanceof Date)) {
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
    if ('text' in v) return String(v.text).trim(); // lien (email)
    if ('result' in v) return texte(v.result as ExcelJS.CellValue);
    return '';
  }
  return String(v).trim();
}

export interface ApercuEcole {
  changements: { champ: string; avant: string; apres: string }[];
  erreurs: string[];
  champsIgnores: string[];
}

@Injectable()
export class EcoleExcelService {
  constructor(private configuration: ConfigurationService) {}

  async exporter(ecoleId: string) {
    const ecole = await this.configuration.ecole(ecoleId);
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Coordonnées');
    const entete = ws.addRow(['Champ', 'Valeur']);
    entete.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    entete.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E79' } };
    ws.getColumn(1).width = 34;
    ws.getColumn(2).width = 60;
    for (const c of CHAMPS) {
      const valeur = (ecole as Record<string, unknown>)[c.cle];
      ws.addRow([c.libelle, valeur ?? '']);
    }
    ws.addRow([]);
    ws.addRow(['Modifiez la colonne « Valeur » puis réimportez ce fichier depuis Configuration > Coordonnées.']).font = { italic: true, color: { argb: 'FF888888' } };
    return (await wb.xlsx.writeBuffer()) as unknown as Buffer;
  }

  private async analyser(ecoleId: string, buffer: Buffer) {
    const ecole = (await this.configuration.ecole(ecoleId)) as Record<string, unknown>;
    const wb = new ExcelJS.Workbook();
    try {
      await wb.xlsx.load(buffer as any);
    } catch {
      throw new BadRequestException("Ce fichier n'est pas un classeur Excel (.xlsx) lisible");
    }
    const ws = wb.worksheets.find((w) => normaliser(w.name) === 'coordonnees') ?? wb.worksheets[0];
    if (!ws) throw new BadRequestException('Fichier Excel vide');

    const dto: UpdateEcoleDto = {};
    const apercu: ApercuEcole = { changements: [], erreurs: [], champsIgnores: [] };
    let reconnus = 0;
    for (let i = 1; i <= ws.rowCount; i++) {
      const row = ws.getRow(i);
      const libelle = texte(row.getCell(1).value);
      if (!libelle || normaliser(libelle) === 'champ') continue;
      const champ = CHAMPS.find((c) => normaliser(c.libelle) === normaliser(libelle) || normaliser(c.cle) === normaliser(libelle));
      if (!champ) {
        if (!/^modifiez/i.test(libelle)) apercu.champsIgnores.push(libelle);
        continue;
      }
      reconnus++;
      const brut = texte(row.getCell(2).value);
      const avant = ecole[champ.cle] === null || ecole[champ.cle] === undefined ? '' : String(ecole[champ.cle]);
      if (champ.cle === 'numeroRecuDepart') {
        const n = brut ? Number(brut.replace(/\s/g, '')) : null;
        if (n !== null && (!Number.isInteger(n) || n < 1)) {
          apercu.erreurs.push(`${champ.libelle} : « ${brut} » doit être un nombre entier à partir de 1`);
          continue;
        }
        dto.numeroRecuDepart = n;
        if ((n === null ? '' : String(n)) !== avant) apercu.changements.push({ champ: champ.libelle, avant, apres: n === null ? '' : String(n) });
        continue;
      }
      if (champ.cle === 'nom' && !brut) {
        apercu.erreurs.push("Le nom de l'école ne peut pas être vide");
        continue;
      }
      if (champ.cle === 'email' && brut && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(brut)) {
        apercu.erreurs.push(`Email « ${brut} » invalide`);
        continue;
      }
      (dto as Record<string, unknown>)[champ.cle] = brut;
      if (brut !== avant) apercu.changements.push({ champ: champ.libelle, avant, apres: brut });
    }
    if (!reconnus) throw new BadRequestException('Aucun champ reconnu : partez d’un export des coordonnées.');
    return { dto, apercu };
  }

  async apercu(ecoleId: string, buffer: Buffer): Promise<ApercuEcole> {
    return (await this.analyser(ecoleId, buffer)).apercu;
  }

  async importer(ecoleId: string, buffer: Buffer) {
    const { dto, apercu } = await this.analyser(ecoleId, buffer);
    if (apercu.erreurs.length) throw new BadRequestException(`Le fichier contient des erreurs : ${apercu.erreurs.join(' ; ')}`);
    const ecole = await this.configuration.updateEcole(ecoleId, dto);
    return { modifies: apercu.changements.length, ecole };
  }
}
