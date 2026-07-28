import { BadRequestException } from '@nestjs/common';
import { diskStorage } from 'multer';
import { existsSync, mkdirSync } from 'fs';
import { extname } from 'path';
import { randomBytes } from 'crypto';
import { DOSSIER_UPLOADS } from './documents.service';

const MIMES_AUTORISES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'application/msword', // .doc
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];
export const TAILLE_MAX_OCTETS = 10 * 1024 * 1024; // 10 Mo

export const multerOptionsDocuments = {
  storage: diskStorage({
    destination: (_req: any, _file: any, cb: (error: Error | null, destination: string) => void) => {
      if (!existsSync(DOSSIER_UPLOADS)) {
        mkdirSync(DOSSIER_UPLOADS, { recursive: true });
      }
      cb(null, DOSSIER_UPLOADS);
    },
    filename: (_req: any, file: any, cb: (error: Error | null, filename: string) => void) => {
      const nom = `${Date.now()}-${randomBytes(6).toString('hex')}${extname(file.originalname)}`;
      cb(null, nom);
    },
  }),
  limits: { fileSize: TAILLE_MAX_OCTETS },
  fileFilter: (_req: any, file: any, cb: (error: Error | null, accept: boolean) => void) => {
    if (!MIMES_AUTORISES.includes(file.mimetype)) {
      return cb(
        new BadRequestException('Format non supporté (PDF, images JPG/PNG/GIF/WEBP/HEIC, Word DOC/DOCX)'),
        false,
      );
    }
    cb(null, true);
  },
};
