import { ValidationPipe, UnprocessableEntityException, ValidationError } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

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
