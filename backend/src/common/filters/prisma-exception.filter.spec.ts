import { ConflictException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { mapPrismaError, PrismaExceptionFilter } from './prisma-exception.filter';

const erreurPrisma = (code: string, modelName?: string) =>
  Object.assign(new Error('prisma'), { name: 'PrismaClientKnownRequestError', code, meta: modelName ? { modelName } : {} });

describe('mapPrismaError', () => {
  it('P2025 (introuvable) => 404 avec le nom de l\'entité', () => {
    const e = mapPrismaError(erreurPrisma('P2025', 'Eleve'));
    expect(e).toBeInstanceOf(NotFoundException);
    expect(e!.getStatus()).toBe(404);
    expect((e!.getResponse() as any).message).toBe('Élève introuvable');
  });

  it('P2002 (doublon) => 409', () => {
    const e = mapPrismaError(erreurPrisma('P2002', 'Classe'));
    expect(e).toBeInstanceOf(ConflictException);
    expect(e!.getStatus()).toBe(409);
    expect((e!.getResponse() as any).message).toContain('classe');
  });

  it('P2003 (encore référencé) => 409 avec message de suppression impossible', () => {
    const e = mapPrismaError(erreurPrisma('P2003', 'Niveau'));
    expect(e!.getStatus()).toBe(409);
    expect((e!.getResponse() as any).message).toBe(
      "Opération impossible : cet élément (niveau) est encore utilisé par d'autres données",
    );
  });

  it("garde un message générique quand le modèle est inconnu", () => {
    expect((mapPrismaError(erreurPrisma('P2025'))!.getResponse() as any).message).toBe('Élément introuvable');
    expect((mapPrismaError(erreurPrisma('P2002', 'ModeleInconnu'))!.getResponse() as any).message).toBe(
      'Doublon : cet élément existe déjà',
    );
  });

  it("reconnaît une erreur Prisma à son code même si le nom de classe diffère", () => {
    expect(mapPrismaError({ code: 'P2025', meta: { modelName: 'Facture' } })).toBeInstanceOf(NotFoundException);
  });

  it.each([
    ['une erreur quelconque', new Error('boom')],
    ['une HttpException', new NotFoundException()],
    ['un code Prisma non géré', erreurPrisma('P1001')],
    ['null', null],
    ['une chaîne', 'oups'],
    ['un objet avec un code non Prisma', { code: 'ECONNRESET' }],
  ])('laisse passer %s (renvoie null)', (_nom, exception) => {
    expect(mapPrismaError(exception)).toBeNull();
  });
});

describe('PrismaExceptionFilter', () => {
  // Le filtre délègue à BaseExceptionFilter ; on espionne super.catch via l'adaptateur HTTP.
  function creerFiltre() {
    const reply = jest.fn();
    const adapter: any = { reply, isHeadersSent: () => false, end: jest.fn(), getRequestMethod: jest.fn() };
    const filtre = new PrismaExceptionFilter(adapter);
    const host: any = {
      getType: () => 'http',
      getArgByIndex: () => ({ id: 'res' }),
      switchToHttp: () => ({ getResponse: () => ({ id: 'res' }), getRequest: () => ({}) }),
    };
    return { filtre, host, reply };
  }

  it('répond 404 pour un enregistrement introuvable', () => {
    const { filtre, host, reply } = creerFiltre();
    filtre.catch(erreurPrisma('P2025', 'Facture'), host);
    expect(reply).toHaveBeenCalledTimes(1);
    expect(reply.mock.calls[0][1]).toMatchObject({ statusCode: 404, message: 'Facture introuvable' });
    expect(reply.mock.calls[0][2]).toBe(404);
  });

  it('répond 409 pour un doublon', () => {
    const { filtre, host, reply } = creerFiltre();
    filtre.catch(erreurPrisma('P2002', 'Classe'), host);
    expect(reply.mock.calls[0][2]).toBe(409);
  });

  it('ne modifie pas le statut des HttpException applicatives (ex: 400)', () => {
    const { filtre, host, reply } = creerFiltre();
    filtre.catch(new HttpException('Données invalides', 400), host);
    expect(reply.mock.calls[0][2]).toBe(400);
  });

  it('une erreur inconnue reste une 500 (et est journalisée)', () => {
    const erreurLog = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const { filtre, host, reply } = creerFiltre();

    filtre.catch(new Error('boom'), host);

    expect(reply.mock.calls[0][2]).toBe(500);
    expect(erreurLog).toHaveBeenCalled();
    erreurLog.mockRestore();
  });
});
