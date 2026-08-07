import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import * as argon2 from 'argon2';
import { AUDIT_ACTIONS } from '@nexus/shared';
import { AppException } from '../../common/errors/app.exception';
import { QueueService } from '../../infra/queue/queue.service';
import { AuditRepository } from '../audit/audit.repository';
import { AuthRepository } from './auth.repository';

const INVITATION_TTL_HOURS = 72;

/**
 * [CORE] Mời tài khoản — spec §4.3c: link dùng một lần, có hạn,
 * user tự đặt mật khẩu lần đầu. Email đã tồn tại → chỉ thêm membership
 * (users là global identity §4.4b).
 */
@Injectable()
export class InvitationService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly queue: QueueService,
    private readonly audit: AuditRepository,
    private readonly config: ConfigService,
  ) {}

  async invite(input: {
    tenantId: string;
    email: string;
    orgUnitId?: string;
    roleIds: string[];
    invitedById: string;
  }): Promise<{ invitationId: string }> {
    const token = randomBytes(32).toString('base64url');
    const invitation = await this.repo.createInvitation({
      tenantId: input.tenantId,
      email: input.email,
      tokenHash: sha256(token),
      orgUnitId: input.orgUnitId,
      expiresAt: new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000),
      invitedById: input.invitedById,
      roleIds: input.roleIds,
    });

    const webUrl = this.config.get<string>('WEB_URL') ?? 'http://localhost:3000';
    await this.queue.add('MAIL_SEND', {
      kind: 'RAW',
      message: {
        to: input.email,
        subject: 'Lời mời tham gia hệ thống',
        html: `<p>Bạn được mời tham gia. Liên kết hết hạn sau ${INVITATION_TTL_HOURS} giờ:</p>
<p><a href="${webUrl}/accept-invitation?token=${token}">Kích hoạt tài khoản</a></p>`,
      },
    });

    await this.audit.write({
      tenantId: input.tenantId,
      entity: 'Invitation',
      entityId: invitation.id,
      action: AUDIT_ACTIONS.CREATE,
      actorId: input.invitedById,
      after: { email: input.email, roleIds: input.roleIds },
    });
    return { invitationId: invitation.id };
  }

  async accept(input: {
    token: string;
    fullName: string;
    password?: string;
  }): Promise<{ tenantId: string }> {
    const invitation = await this.repo.findInvitationByHash(sha256(input.token));
    if (!invitation || invitation.acceptedAt || invitation.expiresAt < new Date()) {
      throw new AppException('COMMON.NOT_FOUND', {
        message: 'Lời mời không hợp lệ hoặc đã hết hạn',
      });
    }

    const existing = await this.repo.findUserByEmail(invitation.email);
    let passwordHash: string | null = null;
    if (!existing) {
      if (!input.password) {
        throw new AppException('COMMON.VALIDATION_FAILED', {
          details: { password: ['Tài khoản mới phải đặt mật khẩu'] },
        });
      }
      passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
    }

    const { user } = await this.repo.acceptInvitation({
      invitationId: invitation.id,
      tenantId: invitation.tenantId,
      email: invitation.email,
      fullName: input.fullName,
      passwordHash,
      orgUnitId: invitation.orgUnitId ?? undefined,
      roleIds: invitation.roles.map((r) => r.roleId),
    });

    await this.audit.write({
      tenantId: invitation.tenantId,
      entity: 'User',
      entityId: user.id,
      action: AUDIT_ACTIONS.CREATE,
      actorId: user.id,
      after: { email: invitation.email, viaInvitation: invitation.id },
    });
    return { tenantId: invitation.tenantId };
  }
}

function sha256(v: string): string {
  return createHash('sha256').update(v).digest('hex');
}
