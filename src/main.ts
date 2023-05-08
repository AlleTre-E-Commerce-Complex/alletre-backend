import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ForbiddenExceptionFilter } from './common/filters/forbiddenException.filter';
import { UnauthorizedExceptionFilter } from './common/filters/unauthorizedException.filter';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { BadRequestExceptionFilter } from './common/filters/badrequestException.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.useGlobalFilters(new ForbiddenExceptionFilter());
  app.useGlobalFilters(new UnauthorizedExceptionFilter());
  app.useGlobalFilters(new BadRequestExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.setGlobalPrefix('api/');
  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
