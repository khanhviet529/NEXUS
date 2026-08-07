import { ValidationPipe, UnprocessableEntityException, ValidationError } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';

/**
 * Cấu hình dùng chung main.ts + test — MỘT nơi, không lệch nhau.
 * Express 5 mặc định query parser 'simple' → filter[code][eq] thành key
 * phẳng, Filter DSL §3.5 vỡ. Bắt buộc 'extended'.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1'); // §3.1
  const express = app.getHttpAdapter().getInstance() as {
    set(k: string, v: string): void;
  };
  express.set('query parser', 'extended');
  app.use(cookieParser());
  app.useGlobalPipes(buildValidationPipe());
}

/**
 * Phần dựng app dùng chung giữa main.ts, tools/generate-openapi.ts và test.
 * File này KHÔNG có side effect cấp module — import an toàn.
 */

/** Map ValidationError lồng nhau → details { 'items.0.quantity': [...] } (§3.6) */
export function flattenValidationErrors(
  errors: ValidationError[],
  parent = '',
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const err of errors) {
    const path = parent ? `${parent}.${err.property}` : err.property;
    if (err.constraints) out[path] = Object.values(err.constraints);
    if (err.children?.length) Object.assign(out, flattenValidationErrors(err.children, path));
  }
  return out;
}

export function buildValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true, // chống mass assignment (§4.10)
    transform: true,
    exceptionFactory: (errors) =>
      new UnprocessableEntityException({
        message: 'Dữ liệu không hợp lệ',
        details: flattenValidationErrors(errors),
      }),
  });
}

export function buildSwaggerDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Nexus API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('access_token')
    .build();
  return SwaggerModule.createDocument(app, config);
}
