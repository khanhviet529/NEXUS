import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Worker } from 'bullmq';
import Redis from 'ioredis';
import { JOB_NAMES } from '@nexus/shared';
import { AppModule } from './app.module';
import { MailService, type MailMessage } from './infra/mail/mail.service';
import { PasswordResetService } from './modules/auth/password-reset.service';

/**
 * [CORE] Worker BullMQ — spec §2.1 (cùng codebase, khác process), §4.8.
 * Quy tắc: job phải IDEMPOTENT (hệ thống at-least-once); payload tenant-scoped
 * bắt buộc chứa tenantId; actorId trong CLS = 'system:<jobName>'.
 */

export interface MailJobPayload {
  kind: 'RAW' | 'FORGOT_PASSWORD';
  message?: MailMessage;
  email?: string;
  ip?: string;
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const mail = app.get(MailService);
  const passwordReset = app.get(PasswordResetService);

  const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
  });

  const mailWorker = new Worker<MailJobPayload>(
    JOB_NAMES.MAIL_SEND.queue,
    async (job) => {
      const p = job.data;
      switch (p.kind) {
        case 'FORGOT_PASSWORD':
          // Logic nằm NGOÀI đường HTTP → thời gian phản hồi không lộ gì (§4.3c)
          if (p.email) await passwordReset.processForgotPassword(p.email, p.ip);
          break;
        case 'RAW':
          if (p.message) await mail.send(p.message);
          break;
      }
    },
    { connection, concurrency: 5 },
  );

  mailWorker.on('failed', (job, err) => {
    // eslint-disable-next-line no-console
    console.error(`[worker] mail job ${job?.id} failed:`, err.message);
  });

  // Outbox dispatcher (§4.8): poll — claim SKIP LOCKED nên nhiều instance an toàn
  const { OutboxWorkerService } = await import('./modules/outbox/outbox-worker.service');
  const outbox = app.get(OutboxWorkerService);
  const workerId = `worker-${process.pid}`;
  const outboxTimer = setInterval(() => {
    void outbox.runOnce(workerId).catch((e) => {
      // eslint-disable-next-line no-console
      console.error('[worker] outbox lỗi:', e instanceof Error ? e.message : e);
    });
  }, 2_000);

  // eslint-disable-next-line no-console
  console.log(`[worker] mail queue: ${JOB_NAMES.MAIL_SEND.queue} · outbox poll 2s`);

  const shutdown = async () => {
    clearInterval(outboxTimer);
    await mailWorker.close();
    await connection.quit();
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

void bootstrap();
