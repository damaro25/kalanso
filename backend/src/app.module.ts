import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { EcolesModule } from './ecoles/ecoles.module';
import { ElevesModule } from './eleves/eleves.module';
import { FinancesModule } from './finances/finances.module';
import { AbsencesModule } from './absences/absences.module';
import { PersonnelModule } from './personnel/personnel.module';
import { ReportingModule } from './reporting/reporting.module';
import { NotesModule } from './notes/notes.module';
import { EmploiDuTempsModule } from './emploi-du-temps/emploi-du-temps.module';
import { CommunicationModule } from './communication/communication.module';
import { MobileMoneyModule } from './mobile-money/mobile-money.module';
import { AdmissionsModule } from './admissions/admissions.module';
import { PaieModule } from './paie/paie.module';
import { LogistiqueModule } from './logistique/logistique.module';
import { FinanceModule } from './finance/finance.module';
import { BibliothequeModule } from './bibliotheque/bibliotheque.module';
import { ParcoursModule } from './parcours/parcours.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    EcolesModule,
    ElevesModule,
    FinancesModule,
    AbsencesModule,
    PersonnelModule,
    NotesModule,
    EmploiDuTempsModule,
    CommunicationModule,
    MobileMoneyModule,
    AdmissionsModule,
    PaieModule,
    LogistiqueModule,
    FinanceModule,
    BibliothequeModule,
    ParcoursModule,
    ReportingModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
