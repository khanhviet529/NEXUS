import 'reflect-metadata';

/**
 * [CORE] Entrypoint worker BullMQ — spec §2.1: cùng codebase, khác process.
 *
 * GĐ1: placeholder. Queue processor đầu tiên (mail, outbox) vào GĐ2/GĐ5.
 * Quy tắc khi triển khai (§4.8, cookbook §8):
 *  - Payload BẮT BUỘC chứa tenantId; worker set CLS trước khi xử lý
 *  - actorId = 'system:<jobName>'
 *  - Job phải idempotent — hệ thống là at-least-once
 *  - Cron phải có redlock
 */
async function bootstrap(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log('[worker] chưa có queue nào đăng ký — GĐ2+');
}

void bootstrap();
