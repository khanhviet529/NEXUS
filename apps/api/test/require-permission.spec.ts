import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants';
import { createTestApp, type TestHarness } from './setup/test-app';
import { IS_PUBLIC_KEY } from '../src/common/decorators/public.decorator';
import { ALLOW_AUTHENTICATED_KEY } from '../src/common/decorators/allow-authenticated.decorator';
import { PERMISSION_KEY } from '../src/common/decorators/require-permission.decorator';

/**
 * Check #5 (working-agreement §4.1): MỌI endpoint phải khai một trong ba:
 *   @Public() · @AllowAuthenticated() · @RequirePermission('...')
 * Quét metadata TOÀN BỘ route — thêm endpoint mới mà quên là test này đỏ.
 */
describe('Check #5 — endpoint phải khai quyền', () => {
  let h: TestHarness;

  beforeAll(async () => {
    h = await createTestApp();
  });
  afterAll(async () => {
    await h.close();
  });

  it('mọi route có @Public / @AllowAuthenticated / @RequirePermission', () => {
    const modules = h.app.get(ModulesContainer);
    const missing: string[] = [];
    let total = 0;

    for (const mod of modules.values()) {
      for (const wrapper of mod.controllers.values()) {
        const controllerClass = wrapper.metatype;
        if (!controllerClass) continue;
        const prototype = controllerClass.prototype as Record<string, unknown>;
        const basePath = Reflect.getMetadata(PATH_METADATA, controllerClass) as string;

        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          // Descriptor thay vì truy cập trực tiếp — prototype[name] sẽ THỰC THI getter
          const desc = Object.getOwnPropertyDescriptor(prototype, name);
          if (!desc || typeof desc.value !== 'function') continue;
          const handler = desc.value as (...args: unknown[]) => unknown;
          const method = Reflect.getMetadata(METHOD_METADATA, handler);
          if (method === undefined) continue; // không phải route handler

          total++;
          const routePath = Reflect.getMetadata(PATH_METADATA, handler) as string;
          const declared =
            Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true ||
            Reflect.getMetadata(ALLOW_AUTHENTICATED_KEY, handler) === true ||
            Reflect.getMetadata(PERMISSION_KEY, handler) !== undefined ||
            Reflect.getMetadata(IS_PUBLIC_KEY, controllerClass) === true ||
            Reflect.getMetadata(ALLOW_AUTHENTICATED_KEY, controllerClass) === true ||
            Reflect.getMetadata(PERMISSION_KEY, controllerClass) !== undefined;

          if (!declared) {
            missing.push(`${controllerClass.name}.${name} (${basePath}/${routePath})`);
          }
        }
      }
    }

    expect(total).toBeGreaterThan(0);
    expect(missing, `Endpoint thiếu khai quyền:\n${missing.join('\n')}`).toHaveLength(0);
  });
});
