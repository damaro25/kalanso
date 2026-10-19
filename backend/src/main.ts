import 'dotenv/config';
import { HttpAdapterHost, NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { origineAutorisee } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: origineAutorisee });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new PrismaExceptionFilter(app.get(HttpAdapterHost).httpAdapter));
  // 0.0.0.0 : joignable depuis les autres appareils du réseau local (HOST pour restreindre, ex. 127.0.0.1)
  await app.listen(process.env.PORT ?? 3000, process.env.HOST ?? '0.0.0.0');
}
bootstrap();
