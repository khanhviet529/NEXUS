/**
 * [CORE] Tên queue + chính sách retry — spec §4.8.
 * Mỗi loại job một queue riêng. Payload BẮT BUỘC chứa tenantId.
 */
export interface JobPolicy {
  queue: string;
  attempts: number;
  /** backoff luỹ thừa, ms cơ sở */
  backoffMs: number;
}

export const JOB_NAMES = {
  MAIL_SEND: { queue: 'mail:send', attempts: 3, backoffMs: 2_000 },
  OUTBOX_DISPATCH: { queue: 'outbox:dispatch', attempts: 3, backoffMs: 5_000 },
  EXPORT_RUN: { queue: 'export:run', attempts: 3, backoffMs: 10_000 },
  IMPORT_RUN: { queue: 'import:run', attempts: 3, backoffMs: 10_000 },
} as const satisfies Record<string, JobPolicy>;

export type JobName = keyof typeof JOB_NAMES;

/** Mọi payload job phải mang tenant để worker set CLS — spec §4.4b */
export interface TenantJobPayload {
  tenantId: string;
}
