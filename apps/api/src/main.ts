import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { buildSwaggerDocument, buildValidationPipe } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('api/v1'); // §3.1
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config.getOrThrow<string>('ALLOWED_ORIGINS').split(','),
    credentials: true,
  });
  app.useGlobalPipes(buildValidationPipe());

  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API: http://localhost:${port}/api/v1 · Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
