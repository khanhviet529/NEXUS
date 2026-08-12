# syntax=docker/dockerfile:1
# Image cho apps/api — dùng chung cho cả API và worker (§2.1: cùng codebase,
# khác process; CMD khác nhau ở tầng orchestration).

FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# --- deps: cài ĐẦY ĐỦ (dev + prod) cho bước build; cache theo lockfile ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config-ts/package.json packages/config-ts/
COPY packages/config-eslint/package.json packages/config-eslint/
RUN pnpm install --frozen-lockfile --filter @nexus/api... --filter @nexus/shared...

# --- build: sinh Prisma client + biên dịch TS ---
FROM deps AS build
COPY . .
RUN pnpm --filter @nexus/shared build \
 && pnpm --filter @nexus/api prisma:generate \
 && pnpm --filter @nexus/api build

# --- prod-deps: cài LẠI chỉ production (Phase 5: image 1,17GB → <400MB).
# Trước đây runtime chép node_modules của stage build — tức ôm theo TOÀN BỘ
# devDependencies (typescript, @nestjs/cli, vitest, testcontainers…).
# `prisma` CLI nay là dependency THẬT của apps/api: bước migration của CD
# chạy bằng chính image này (schema và code cùng phiên bản) nên CLI phải có
# mặt ở runtime — không được rơi theo devDependencies.
FROM base AS prod-deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/
COPY packages/config-ts/package.json packages/config-ts/
COPY packages/config-eslint/package.json packages/config-eslint/
RUN pnpm install --frozen-lockfile --prod --filter @nexus/api... --filter @nexus/shared...
# Prisma client SINH LẠI trong cây prod (generate ghi vào node_modules —
# chép cây node_modules từ stage build là rước lại devDependencies)
COPY apps/api/prisma/schema.prisma apps/api/prisma/schema.prisma
RUN pnpm --filter @nexus/api exec prisma generate

# --- runtime: chỉ dependency production + artefact build ---
FROM base AS runtime
ENV NODE_ENV=production
# Không chạy bằng root (§4.10)
RUN addgroup -S nexus && adduser -S nexus -G nexus

COPY --from=prod-deps /app/node_modules ./node_modules
# apps/api/node_modules là nơi pnpm đặt LIÊN KẾT tới dependency của gói này.
# Thiếu nó thì mọi require đều chết ("Cannot find module 'reflect-metadata'"),
# và `prisma` CLI cũng không có nên bước migration của CD không chạy được.
COPY --from=prod-deps /app/apps/api/node_modules ./apps/api/node_modules
# @nexus/shared là symlink vào packages/shared — cần package.json + dist thật
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/package.json ./apps/api/
# Migration + seed đi theo image: bước "chạy migration" của CD dùng chính
# image này, đảm bảo schema và code luôn cùng một phiên bản
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

USER nexus
WORKDIR /app/apps/api
EXPOSE 4000

# Health check ở tầng container — CD dựa vào đây để quyết rollback (§9)
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.API_PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/main.js"]
