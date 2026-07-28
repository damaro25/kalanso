import { Module } from '@nestjs/common';
import { CommunicationController } from './communication.controller';
import { CommunicationService } from './communication.service';
import { SmsProvider, SmsSimuleService } from './sms.service';

@Module({
  controllers: [CommunicationController],
  providers: [CommunicationService, { provide: SmsProvider, useClass: SmsSimuleService }],
  exports: [CommunicationService],
})
export class CommunicationModule {}
