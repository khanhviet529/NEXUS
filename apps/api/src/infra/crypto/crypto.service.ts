import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * [CORE] Mã hoá secret tầng ứng dụng — spec §4.11, quyết định #35.
 * AES-256-GCM, key từ APP_ENCRYPTION_KEY (base64 32 byte), kèm version
 * để xoay key sau này. Định dạng: v<ver>:<iv b64>:<tag b64>:<data b64>.
 * API KHÔNG BAO GIỜ trả plaintext secret — chỉ Replace/Rotate.
 */
@Injectable()
export class CryptoService {
  private readonly key: Buffer;
  private readonly version: string;

  constructor(config: ConfigService) {
    const raw = config.get<string>('APP_ENCRYPTION_KEY');
    // Dev/test fallback cố định độ dài 32 byte — production PHẢI đặt ENV thật
    this.key =
      raw && raw !== 'CHANGE_ME_base64_32_bytes'
        ? Buffer.from(raw, 'base64')
        : Buffer.alloc(32, 'nexus-dev-only-key-not-secret!!');
    if (this.key.length !== 32) {
      throw new Error('APP_ENCRYPTION_KEY phải là base64 của đúng 32 byte (§4.11)');
    }
    this.version = config.get<string>('APP_ENCRYPTION_KEY_VERSION') ?? '1';
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `v${this.version}:${iv.toString('base64')}:${tag.toString('base64')}:${data.toString('base64')}`;
  }

  decrypt(payload: string): string {
    const [, ivB64, tagB64, dataB64] = payload.split(':');
    if (!ivB64 || !tagB64 || !dataB64) throw new Error('Payload mã hoá sai định dạng');
    const decipher = createDecipheriv('aes-256-gcm', this.key, Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }
}
