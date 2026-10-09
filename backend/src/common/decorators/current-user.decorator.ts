import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export interface JwtPayloadUser {
  userId: string;
  ecoleId: string;
  role: string;
  email: string;
  // Fiche du personnel liée au compte : sert à retrouver les classes d'un enseignant.
  personnelId?: string | null;
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtPayloadUser => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
