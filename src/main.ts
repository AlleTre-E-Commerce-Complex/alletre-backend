import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { ForbiddenExceptionFilter } from './common/filters/forbiddenException.filter';
import { UnauthorizedExceptionFilter } from './common/filters/unauthorizedException.filter';
import { Logger, LoggerErrorInterceptor } from 'nestjs-pino';
import { BadRequestExceptionFilter } from './common/filters/badrequestException.filter';
import { PrismaService } from './prisma/prisma.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    bufferLogs: true,
    rawBody: true,
  });
  // const allowedOrigins =
  //   process.env.NODE_ENV === 'production'
  //     ? [process.env.FRONT_URL, process.env.ADMIN_FRONT_URL]
  //     : ['*'];

  // app.enableCors({
  //   origin: (origin, callback) => {
  //     if (allowedOrigins.includes(origin) || !origin) {
  //       callback(null, true); // Allow the request
  //     } else {
  //       callback(new Error('Not allowed by CORS')); // Reject the request
  //     }
  //   },
  // });

  const allowedOrigins =
    process.env.NODE_ENV === 'production'
      ? [process.env.FRONT_URL, process.env.ADMIN_FRONT_URL]
      : [
          'http://localhost:3000',
          'http://localhost:3002',
          'http://192.168.0.89:3000',
        ]; // Add your development URLs

  app.enableCors({
    origin: (origin, callback) => {
      console.log('allowed origins : '+JSON.stringify(allowedOrigins))
      if (!origin || allowedOrigins.includes(origin)) {
        // Allow requests with valid origin or no origin (e.g., Postman)
        callback(null, true);
      } else {
        console.error(`Blocked by CORS: ${origin}`); // Log the rejected origin
        callback(new Error('CORS not allowed for this origin'));
      }
    },
    credentials: true, // Allow credentials (cookies, tokens)
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE', // Specify allowed methods
  });

  app.useGlobalInterceptors(new LoggerErrorInterceptor());

  // Create an instance of PrismaService
  const prismaService = app.get(PrismaService);

  // Handle process exit events
  const exitHandler = async () => {
    await prismaService.$disconnect();
    await app.close();
  };

  process.on('exit', exitHandler);
  process.on('beforeExit', exitHandler);
  process.on('SIGINT', exitHandler);
  process.on('SIGTERM', exitHandler);
  process.on('SIGUSR2', exitHandler);

  app.useGlobalFilters(new ForbiddenExceptionFilter());
  app.useGlobalFilters(new UnauthorizedExceptionFilter());
  app.useGlobalFilters(new BadRequestExceptionFilter());
  app.useGlobalPipes(new ValidationPipe({ transform: true }));

  app.setGlobalPrefix('api/');
  app.useLogger(app.get(Logger));

  const PORT = process.env.PORT || 3001;
  await app.listen(PORT, () =>
    console.log(`The port is running at http://localhost:${PORT}`),
  );
}

bootstrap();
