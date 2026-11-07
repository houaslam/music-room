import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import { createOAuthSession } from './auth/session/oauth-session.js';
import {
  BadRequestException,
  ValidationPipe,
  VersioningType,
} from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  if (process.env.NODE_ENV !== 'production') {
    app.enableCors({
      origin:
        /^http:\/\/(localhost|127\.0\.0\.1|\[::1\]):(8081|8082|8083|19006)$/,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Platform',
        'X-Device-Model',
        'X-App-Version',
        'X-Device-Id',
      ],
    });
  }
  app.use('/api/v1/auth/oauth', createOAuthSession(app.get(ConfigService)));
  app.enableShutdownHooks();
  app.enableVersioning({
    type: VersioningType.URI,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors) => {
        return new BadRequestException({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: errors.map((error) => ({
              fields: error.property,
              message: Object.values(error.constraints ?? {}),
            })),
          },
        });
      },
    }),
  );
  app.setGlobalPrefix('api/v1');
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
