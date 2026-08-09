import type { INestApplication } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { IS_PUBLIC_KEY } from '../../src/common/decorators/public.decorator';
import { ALLOW_AUTHENTICATED_KEY } from '../../src/common/decorators/allow-authenticated.decorator';
import { PERMISSION_KEY } from '../../src/common/decorators/require-permission.decorator';

/**
 * Route inventory — test-catalog §2.1.
 *
 * ⚠ Catalog đề xuất đọc `server._router.stack` và tự đánh dấu đó là
 * "adapter-specific, không phải contract". Ở đây dùng `ModulesContainer` +
 * Reflector thay thế: cùng dữ liệu, nhưng là API CÔNG KHAI của Nest nên không
 * vỡ khi nâng Express hay đổi sang Fastify. `require-permission.spec.ts` đã đi
 * đường này từ trước; tách ra đây để tầng 1 dùng chung.
 *
 * Không viết tay danh sách 116 endpoint: danh sách viết tay lệch khỏi code
 * ngay ở PR kế tiếp và không ai nhận ra.
 */
export interface RouteInfo {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE' | 'OPTIONS' | 'HEAD' | 'ALL';
  /** '/api/v1/orders/:id/approve' */
  path: string;
  permission: string | null;
  isPublic: boolean;
  allowAuthenticated: boolean;
  /** 'OrdersController.approve' */
  handler: string;
}

const METHOD_NAME: Record<number, RouteInfo['method']> = {
  [RequestMethod.GET]: 'GET',
  [RequestMethod.POST]: 'POST',
  [RequestMethod.PUT]: 'PUT',
  [RequestMethod.DELETE]: 'DELETE',
  [RequestMethod.PATCH]: 'PATCH',
  [RequestMethod.ALL]: 'ALL',
  [RequestMethod.OPTIONS]: 'OPTIONS',
  [RequestMethod.HEAD]: 'HEAD',
};

const GLOBAL_PREFIX = '/api/v1';

function join(...parts: (string | undefined)[]): string {
  const cleaned = parts
    .filter((p): p is string => typeof p === 'string' && p !== '' && p !== '/')
    .map((p) => p.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean);
  return `/${cleaned.join('/')}`;
}

export function collectRoutes(app: INestApplication): RouteInfo[] {
  const modules = app.get(ModulesContainer);
  const out: RouteInfo[] = [];

  for (const mod of modules.values()) {
    for (const wrapper of mod.controllers.values()) {
      const controllerClass = wrapper.metatype;
      if (!controllerClass) continue;
      const prototype = controllerClass.prototype as Record<string, unknown>;
      const basePath = Reflect.getMetadata(PATH_METADATA, controllerClass) as string | undefined;

      for (const name of Object.getOwnPropertyNames(prototype)) {
        if (name === 'constructor') continue;
        // Descriptor thay vì prototype[name]: truy cập trực tiếp sẽ THỰC THI getter
        const desc = Object.getOwnPropertyDescriptor(prototype, name);
        if (!desc || typeof desc.value !== 'function') continue;
        const handler = desc.value as (...a: unknown[]) => unknown;
        const methodCode = Reflect.getMetadata(METHOD_METADATA, handler) as number | undefined;
        if (methodCode === undefined) continue;

        const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;

        // Metadata ở HANDLER thắng metadata ở CONTROLLER — đúng thứ tự Nest phân giải
        const readMeta = <T>(key: string): T | undefined =>
          (Reflect.getMetadata(key, handler) as T | undefined) ??
          (Reflect.getMetadata(key, controllerClass) as T | undefined);

        out.push({
          method: METHOD_NAME[methodCode] ?? 'ALL',
          path: join(GLOBAL_PREFIX, basePath, routePath),
          permission: readMeta<string>(PERMISSION_KEY) ?? null,
          isPublic: readMeta<boolean>(IS_PUBLIC_KEY) === true,
          allowAuthenticated: readMeta<boolean>(ALLOW_AUTHENTICATED_KEY) === true,
          handler: `${controllerClass.name}.${name}`,
        });
      }
    }
  }

  return out.sort((a, b) => `${a.method} ${a.path}`.localeCompare(`${b.method} ${b.path}`));
}

export const routeKey = (r: RouteInfo): string => `${r.method} ${r.path}`;

/** Thay `:param` bằng một UUID hợp lệ — 422 vì id sai định dạng không kiểm được gì */
const PLACEHOLDER_UUID = '00000000-0000-4000-8000-000000000000';

export function concreteUrl(r: RouteInfo): string {
  return r.path.replace(/:([A-Za-z0-9_]+)/g, (_, name: string) =>
    // Tham số không phải id thì đưa chuỗi vô hại; id thì phải là UUID hợp lệ
    /id$/i.test(name) ? PLACEHOLDER_UUID : 'x',
  );
}
