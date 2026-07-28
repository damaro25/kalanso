import { Module } from '@nestjs/common';
import { MobileMoneyController } from './mobile-money.controller';
import { MobileMoneyService } from './mobile-money.service';
import { MobileMoneyProvider, MobileMoneySimuleService } from './mobile-money-provider';

@Module({
  controllers: [MobileMoneyController],
  providers: [MobileMoneyService, { provide: MobileMoneyProvider, useClass: MobileMoneySimuleService }],
})
export class MobileMoneyModule {}
