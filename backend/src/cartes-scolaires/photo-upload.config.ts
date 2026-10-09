import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export const DOSSIER_PHOTOS = join(process.cwd(), 'uploads', 'photos-eleves');

// PDFKit n'intègre que le JPEG et le PNG, et ne redimensionne rien : la photo est réduite côté navigateur
// avant l'envoi (quelques dizaines de Ko), la limite sert de garde-fou pour le poids du PDF d'une classe.
export const TAILLE_MAX_PHOTO = 2 * 1024 * 1024; // 2 Mo
export const MIMES_PHOTO = ['image/jpeg', 'image/png'];

export const multerOptionsPhoto = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
      if (!existsSync(DOSSIER_PHOTOS)) {
        mkdirSync(DOSSIER_PHOTOS, { recursive: true });
      }
      cb(null, DOSSIER_PHOTOS);
    },
    filename: (_req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
      cb(null, `${randomBytes(10).toString('hex')}${file.mimetype === 'image/png' ? '.png' : '.jpg'}`);
    },
  }),
  limits: { fileSize: TAILLE_MAX_PHOTO },
  fileFilter: (_req: any, file: any, cb: (error: Error | null, accept: boolean) => void) => {
    if (!MIMES_PHOTO.includes(file.mimetype)) {
      return cb(new BadRequestException('Format non supporté : la photo doit être une image JPEG ou PNG'), false);
    }
    cb(null, true);
  },
};
