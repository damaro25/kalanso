import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// PostgreSQL (serveur) ou SQLite (version bureau, DATABASE_URL="file:…") ; le client Prisma est généré pour le
// fournisseur correspondant (voir desktop/scripts/preparer.mjs pour SQLite).
function adaptateur() {
  const url = process.env.DATABASE_URL as string;
  if (url?.startsWith('file:')) {
    // Chargé seulement pour la version bureau, qui embarque ce paquet
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaLibSql } = require('@prisma/adapter-libsql') as typeof import('@prisma/adapter-libsql');
    return new PrismaLibSql({ url });
  }
  return new PrismaPg({ connectionString: url });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super({ adapter: adaptateur() } as ConstructorParameters<typeof PrismaClient>[0]);
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
