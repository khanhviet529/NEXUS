import { ValidationPipe, UnprocessableEntityException, ValidationError } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { json, urlencoded } from 'express';
import type { NextFunction, Request, Response } from 'express';
import { randomUUID } from 'node:crypto';

/**
 * Cấu hình dùng chung main.ts + test — MỘT nơi, không lệch nhau.
 * - Express 5 mặc định query parser 'simple' → filter[code][eq] thành key
 *   phẳng, Filter DSL §3.5 vỡ. Bắt buộc 'extended'.
 * - body-parser mặc định 100kb — import theo lô (§4.7) cần lớn hơn.
 *   App tạo với { bodyParser: false }, parser khai Ở ĐÂY.
 */
export function configureApp(app: INestApplication): void {
  app.setGlobalPrefix('api/v1'); // §3.1
  const express = app.getHttpAdapter().getInstance() as {
    set(k: string, v: string): void;
  };
  express.set('query parser', 'extended');
  app.use(json({ limit: '20mb' }));
  app.use(urlencoded({ extended: true, limit: '20mb' }));
  app.use(cookieParser());
  app.use(echoRequestId);
  app.useGlobalPipes(buildValidationPipe());
}

/**
 * §3.1c: X-Request-Id LUÔN được trả lại — kể cả ở nhánh lỗi.
 *
 * Trước đây traceId chỉ được đặt vào CLS (app.module.ts) và đưa vào THÂN lỗi;
 * header phản hồi thì không ai đặt. Test tầng 1 (U1/U5) bắt đúng chỗ này: 110
 * route trả 401 mà không có header.
 *
 * Vì sao header quan trọng hơn là "cũng có trong body": khi phản hồi KHÔNG có
 * body (204, 304, file stream, hoặc lỗi ở tầng proxy) thì header là thứ duy
 * nhất nối được log của client với log của server.
 *
 * Đặt bằng middleware Express, không phải interceptor: interceptor không chạy
 * cho request bị chặn TRƯỚC khi vào pipeline (404 route không tồn tại, lỗi
 * body-parser). Middleware chạy cho mọi thứ.
 */
export function echoRequestId(req: Request, res: Response, next: NextFunction): void {
  const traceId = (req.headers['x-request-id'] as string | undefined) || randomUUID();
  req.headers['x-request-id'] = traceId; // CLS đọc lại chính giá trị này
  res.setHeader('X-Request-Id', traceId);
  next();
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
