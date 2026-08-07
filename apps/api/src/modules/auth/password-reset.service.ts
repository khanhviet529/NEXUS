import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import { QueueService } from '../../infra/queue/queue.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuthRepository } from './auth.repository';
import { RateLimitService } from './rate-limit.service';
import { SessionService } from './session.service';

const TOKEN_TTL_MINUTES = 30; // §4.3c: 15–30 phút, dùng một lần

/**
 * [CORE] Quên mật khẩu — spec §4.3c, quyết định #34.
 *
 * CHỐNG DÒ TÀI KHOẢN: HTTP handler chỉ rate-limit rồi ENQUEUE và trả 202 —
 * việc tra email/tạo token/gửi mail nằm ở WORKER, nên response và thời gian
 * phản hồi GIỐNG HỆT dù email có tồn tại hay không (spec: "gửi mail qua
 * queue, không gửi đồng bộ").
 */
@Injectable()
export class PasswordResetService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly rateLimit: RateLimitService,
    private readonly queue: QueueService,
    private readonly sessions: SessionService,
    private readonly audit: AuditRepository,
    private readonly config: ConfigService,
  ) {}

  /** HTTP handler — LUÔN 202, không lộ gì */
  async request(email: string, ip: string): Promise<void> {
    await this.rateLimit.checkForgotPassword(ip, email);
    await this.queue.add('MAIL_SEND', { kind: 'FORGOT_PASSWORD', email, ip });
  }

  /** Worker gọi — ngoài đường HTTP nên không lộ timing */
  async processForgotPassword(email: string, ip?: string): Promise<void> {
    const user = await this.repo.findUserByEmail(email);
    // Không tồn tại / bị vô hiệu hoá → im lặng, không gửi gì (§4.3c)
    if (!user || user.status !== 'ACTIVE') return;

    await this.repo.invalidateUserResetTokens(user.id); // token mới vô hiệu token cũ
    const token = randomBytes(32).toString('base64url');
    await this.repo.createPasswordResetToken({
      userId: user.id,
      tokenHash: sha256(token),
      expiresAt: new Date(Date.now() + TOKEN_TTL_MINUTES * 60_000),
      requestedIp: ip,
    });

    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    await this.queue.add('MAIL_SEND', {
      kind: 'RAW',
      message: {
        to: email,
        subject: 'Đặt lại mật khẩu',
        html: `<p>Bấm vào liên kết sau để đặt lại mật khẩu (hết hạn sau ${TOKEN_TTL_MINUTES} phút):</p>
<p><a href="${webUrl}/reset-password?token=${token}">Đặt lại mật khẩu</a></p>
<p>Nếu không phải bạn yêu cầu, bỏ qua email này.</p>`,
      },
    });
  }

  /** POST /auth/reset-password — 6 bước theo §4.3c */
  async reset(token: string, newPassword: string, ip?: string): Promise<void> {
    const row = await this.repo.findValidResetToken(sha256(token)); // 1. verify hash + hạn + chưa dùng
    if (!row) throw new AppException('COMMON.NOT_FOUND', { message: 'Token không hợp lệ hoặc đã hết hạn' });

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id }); // 2. argon2id
    await this.repo.updatePassword(row.userId, passwordHash);
    await this.repo.markResetTokenUsed(row.id); // 3. dùng một lần
    await this.sessions.revokeAllOfUser(row.userId); // 4. thu hồi MỌI session, mọi tenant

    // 5. audit — ghi cho từng tenant user là thành viên
    const user = await this.repo.findUserById(row.userId);
    const memberships = await this.repo.findActiveMemberships(row.userId);
    for (const m of memberships) {
      await this.audit.write({
        tenantId: m.tenantId,
        entity: 'User',
        entityId: row.userId,
        action: AUDIT_ACTIONS.PASSWORD_RESET,
        actorId: row.userId,
        ip,
      });
    }

    // 6. email cảnh báo kèm IP + thời điểm
    if (user) {
      await this.queue.add('MAIL_SEND', {
        kind: 'RAW',
        message: {
          to: user.email,
          subject: 'Mật khẩu của bạn vừa được thay đổi',
          html: `<p>Mật khẩu tài khoản vừa được đổi lúc ${new Date().toISOString()}${ip ? ` từ IP ${ip}` : ''}.</p>
<p>Nếu không phải bạn, liên hệ quản trị viên NGAY.</p>`,
        },
      });
    }
  }
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
