# ADR-0002: Next.js 15 (đúng spec) và các pin phiên bản GĐ1

- **Ngày:** 2026-08-07
- **Trạng thái:** Chấp nhận
- **Ảnh hưởng tới:** spec §2.3

## Quyết định

| Gói | Phiên bản | Ghi chú |
|---|---|---|
| Next.js | **15.5.23** (pin) | Đúng spec §2.3. Next 16 đã ra nhưng hệ sinh thái shadcn/nuqs/orval ổn định trên 15 |
| NestJS | ^11.1 | Đúng spec |
| Prisma | 6.19.3 | Xem ADR-0001 |
| Node | ≥22 (dev đang chạy 24) | |
| pnpm | 8.15.9 | |
| orval | ^7 | OpenAPI → TanStack Query hooks |

## Ghi chú tooling (phát hiện khi dựng GĐ1)

- **tsx/esbuild KHÔNG emit decorator metadata** → DI của NestJS hỏng khi chạy
  code Nest qua tsx. Quy ước: script chạm NestFactory dùng `ts-node -T`;
  vitest dùng `unplugin-swc` (decoratorMetadata: true). Seed thuần Prisma vẫn
  dùng tsx được.
- `main.ts` phải không được import từ nơi khác (có side effect `bootstrap()`
  cấp module) — phần dựng app dùng chung nằm ở `src/bootstrap.ts`.
