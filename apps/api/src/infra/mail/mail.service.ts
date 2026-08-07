import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

/**
 * [CORE] Mail — spec §4.8: gửi qua queue, dev dùng mailpit.
 * NODE_ENV=test → driver memory: mail được GIỮ LẠI trong `sentMails` để test
 * đọc token (forgot password, invitation) mà không cần SMTP thật.
 *
 * Service này chỉ là TRANSPORT — không gọi trực tiếp từ luồng request,
 * luôn đi qua queue MAIL_SEND (chống dò timing §4.3c, chống chậm request).
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: Transporter | null;

  /** Chỉ dùng trong test (driver memory) */
  readonly sentMails: MailMessage[] = [];

  constructor(private readonly config: ConfigService) {
    if (config.get('NODE_ENV') === 'test') {
      this.transporter = null; // memory driver
    } else {
      this.transporter = createTransport({
        host: config.get<string>('SMTP_HOST') ?? 'localhost',
        port: config.get<number>('SMTP_PORT') ?? 1025,
        secure: false,
      });
    }
  }

  async send(msg: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.sentMails.push(msg);
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get<string>('SMTP_FROM') ?? 'noreply@nexus.local',
      ...msg,
    });
    this.logger.log(`Mail sent: ${msg.subject} → ${msg.to}`);
  }
}
