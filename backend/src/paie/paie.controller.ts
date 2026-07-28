import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayloadUser } from '../common/decorators/current-user.decorator';
import { RoleUtilisateur } from '../generated/prisma/enums';
import { PaieService } from './paie.service';
import { CreateBulletinPaieDto } from './dto/bulletin-paie.dto';

const ROLES_PAIE = [RoleUtilisateur.FONDATEUR, RoleUtilisateur.CHEF_ETABLISSEMENT, RoleUtilisateur.COMPTABLE];
const multerOptionsImport = { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } };

@Controller('paie/bulletins')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(...ROLES_PAIE)
export class PaieController {
  constructor(private service: PaieService) {}

  @Get()
  findByMois(
    @CurrentUser() user: JwtPayloadUser,
    @Query('mois') mois: string,
    @Query('annee') annee: string,
  ) {
    return this.service.findByMois(user.ecoleId, Number(mois), Number(annee));
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.findOne(user.ecoleId, id);
  }

  @Post()
  creer(@CurrentUser() user: JwtPayloadUser, @Body() dto: CreateBulletinPaieDto) {
    return this.service.creerBulletin(user.ecoleId, dto, user.userId);
  }

  @Post('import')
  @UseInterceptors(FileInterceptor('fichier', multerOptionsImport))
  importBulletins(@CurrentUser() user: JwtPayloadUser, @UploadedFile() fichier?: Express.Multer.File) {
    if (!fichier) {
      throw new BadRequestException('Aucun fichier fourni');
    }
    return this.service.importXlsx(user.ecoleId, fichier.buffer, user.userId);
  }

  @Post(':id/valider')
  valider(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.valider(user.ecoleId, id);
  }

  @Delete(':id')
  supprimer(@CurrentUser() user: JwtPayloadUser, @Param('id') id: string) {
    return this.service.supprimer(user.ecoleId, id);
  }
}
