import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ForbiddenExceptionFilter } from './common/filters/forbiddenException.filter';
import { UnauthorizedExceptionFilter } from './common/filters/unauthorizedException.filter';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.enableCors({ origin: '*' });
  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  app.useGlobalPipes(new ValidationPipe());

  app.useGlobalFilters(new ForbiddenExceptionFilter());
  app.useGlobalFilters(new UnauthorizedExceptionFilter());

  app.setGlobalPrefix('api/');
  app.useLogger(app.get(Logger));

  await app.listen(process.env.PORT || 3000);
}
bootstrap();
