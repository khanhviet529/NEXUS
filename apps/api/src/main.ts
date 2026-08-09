import 'reflect-metadata';
// PHẢI trước mọi import module: Sentry vá thư viện lúc nạp (§9)
import { initSentry } from './infra/observability/sentry';
initSentry('api');
import { NestFactory } from '@nestjs/core';
import { SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { buildSwaggerDocument, configureApp } from './bootstrap';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);

  configureApp(app); // prefix + query parser extended + cookie + validation
  app.use(helmet());
  app.enableCors({
    origin: config.getOrThrow<string>('ALLOWED_ORIGINS').split(','),
    credentials: true,
  });

  const document = buildSwaggerDocument(app);
  SwaggerModule.setup('docs', app, document);

  const port = config.getOrThrow<number>('API_PORT');
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`API: http://localhost:${port}/api/v1 · Swagger: http://localhost:${port}/docs`);
}

void bootstrap();
