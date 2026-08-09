import { describe, it, expect, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/mocks/server';
import { apiError } from '@/mocks/handlers';
import { renderWithProviders, screen, userEvent, waitFor } from '@/test/render';
import { UploadDropzone } from './upload-dropzone';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const S3 = 'https://s3.test/presigned-put';

/**
 * Nợ test PR#4. Luồng presign (§2): byte KHÔNG đi qua API server —
 * presign → PUT thẳng S3 → confirm. Test chặn cả hai chặng ở tầng network
 * để chứng minh đúng THỨ TỰ và đúng đích đến.
 */
function mockUploadFlow(opts?: { putStatus?: number }) {
  const calls: string[] = [];
  server.use(
    http.post(`${API}/api/v1/files/presign`, async () => {
      calls.push('presign');
      return HttpResponse.json({ fileId: 'file-1', objectKey: 'tenant-a/file-1.pdf', uploadUrl: S3 });
    }),
    http.put(S3, () => {
      calls.push('put-s3');
      return new HttpResponse(null, { status: opts?.putStatus ?? 200 });
    }),
    http.post(`${API}/api/v1/files/confirm`, async ({ request }) => {
      calls.push('confirm');
      const body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ id: 'file-1', filename: body.filename });
    }),
  );
  return calls;
}

const pickFile = async (name = 'bao-gia.pdf') => {
  const file = new File(['NOI-DUNG'], name, { type: 'application/pdf' });
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await userEvent.upload(input, file);
};

describe('UploadDropzone — nợ test PR#4', () => {
  it('presign → PUT thẳng S3 → confirm, ĐÚNG thứ tự; byte không qua API server', async () => {
    const calls = mockUploadFlow();
    const onUploaded = vi.fn();
    renderWithProviders(<UploadDropzone onUploaded={onUploaded} />);

    await pickFile();
    await waitFor(() => expect(onUploaded).toHaveBeenCalledWith({ id: 'file-1', filename: 'bao-gia.pdf' }));
    expect(calls).toEqual(['presign', 'put-s3', 'confirm']);
  });

  it('đính vào entity → confirm mang entity/entityId (kế thừa quyền §2.5)', async () => {
    let confirmBody: Record<string, unknown> = {};
    server.use(
      http.post(`${API}/api/v1/files/presign`, () =>
        HttpResponse.json({ fileId: 'file-2', objectKey: 'k', uploadUrl: S3 }),
      ),
      http.put(S3, () => new HttpResponse(null, { status: 200 })),
      http.post(`${API}/api/v1/files/confirm`, async ({ request }) => {
        confirmBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ id: 'file-2', filename: 'x' });
      }),
    );
    renderWithProviders(<UploadDropzone entity="Order" entityId="ord-1" category="contract" />);
    await pickFile();

    await waitFor(() => expect(confirmBody.entity).toBe('Order'));
    expect(confirmBody.entityId).toBe('ord-1');
    expect(confirmBody.category).toBe('contract');
  });

  it('PUT S3 hỏng → KHÔNG gọi confirm (không tạo row trỏ vào object không tồn tại)', async () => {
    const calls = mockUploadFlow({ putStatus: 403 });
    const onUploaded = vi.fn();
    renderWithProviders(<UploadDropzone onUploaded={onUploaded} />);

    await pickFile();
    await waitFor(() => expect(calls).toContain('put-s3'));
    expect(calls).not.toContain('confirm');
    expect(onUploaded).not.toHaveBeenCalled();
  });

  it('presign bị từ chối (403 thiếu file:upload) → dừng ngay, không PUT', async () => {
    const calls: string[] = [];
    server.use(
      http.post(`${API}/api/v1/files/presign`, () => apiError('AUTH.FORBIDDEN', 403)),
      http.put(S3, () => {
        calls.push('put-s3');
        return new HttpResponse(null, { status: 200 });
      }),
    );
    const onUploaded = vi.fn();
    renderWithProviders(<UploadDropzone onUploaded={onUploaded} />);

    await pickFile();
    await waitFor(() => expect(onUploaded).not.toHaveBeenCalled());
    expect(calls).toEqual([]);
  });

  it('kéo-thả cũng chạy đúng luồng như bấm chọn', async () => {
    const calls = mockUploadFlow();
    renderWithProviders(<UploadDropzone />);

    const zone = screen.getByRole('button', { name: 'Tải tệp lên' });
    const file = new File(['x'], 'keo-tha.pdf', { type: 'application/pdf' });
    const dataTransfer = { files: [file], items: [], types: ['Files'] };
    await userEvent.pointer({ target: zone });
    zone.dispatchEvent(
      Object.assign(new Event('drop', { bubbles: true }), { dataTransfer }),
    );

    await waitFor(() => expect(calls).toEqual(['presign', 'put-s3', 'confirm']));
  });
});
