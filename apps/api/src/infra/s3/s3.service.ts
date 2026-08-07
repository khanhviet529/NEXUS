import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

/**
 * [CORE] S3/MinIO — spec §2 ("Presigned URL, không đẩy file qua API server").
 * Object key BẮT BUỘC tiền tố <tenantId>/ (§4.6 checklist tenant) — service này
 * là NƠI DUY NHẤT dựng key, caller không tự ghép chuỗi.
 */
@Injectable()
export class S3Service {
  private readonly client: S3Client;
  readonly bucket: string;

  constructor(config: ConfigService) {
    this.bucket = config.get<string>('S3_BUCKET') ?? 'nexus';
    this.client = new S3Client({
      endpoint: config.get<string>('S3_ENDPOINT') ?? 'http://localhost:9000',
      region: config.get<string>('S3_REGION') ?? 'us-east-1',
      credentials: {
        accessKeyId: config.get<string>('S3_ACCESS_KEY') ?? 'nexus',
        secretAccessKey: config.get<string>('S3_SECRET_KEY') ?? 'nexus-minio',
      },
      forcePathStyle: true, // MinIO không có virtual-host bucket
    });
  }

  /** Key duy nhất, cách ly tenant bằng tiền tố — KHÔNG nhận key từ client */
  buildObjectKey(tenantId: string, fileId: string, filename: string): string {
    // Giữ đuôi file cho dễ nhận diện; tên gốc lưu ở cột filename
    const ext = /\.[A-Za-z0-9]{1,10}$/.exec(filename)?.[0]?.toLowerCase() ?? '';
    return `${tenantId}/${fileId}${ext}`;
  }

  presignPut(objectKey: string, mime: string, expiresIn = 600): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, ContentType: mime }),
      { expiresIn },
    );
  }

  presignGet(objectKey: string, filename: string, expiresIn = 3600): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      }),
      { expiresIn },
    );
  }

  /** Xác minh client ĐÃ upload xong trước khi ghi row files (không cột status) */
  async head(objectKey: string): Promise<{ size: number; etag?: string } | null> {
    try {
      const res = await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      );
      return { size: res.ContentLength ?? 0, etag: res.ETag?.replace(/"/g, '') };
    } catch {
      return null;
    }
  }

  async putObject(objectKey: string, body: Buffer | string, mime: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: objectKey, Body: body, ContentType: mime }),
    );
  }

  /** Upload stream có ContentLength BIẾT TRƯỚC (file tạm) — export worker dùng */
  async putObjectStream(
    objectKey: string,
    body: NodeJS.ReadableStream,
    contentLength: number,
    mime: string,
  ): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: body as never, // sdk nhận Readable; kiểu StreamingBlobPayloadInputTypes không export gọn
        ContentLength: contentLength,
        ContentType: mime,
      }),
    );
  }

  async deleteObject(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
