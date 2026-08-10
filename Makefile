# README cam kết: make setup xong trong dưới 30 phút, quá là bug của repo.
SHELL := /bin/sh

.PHONY: setup dev up down migrate seed reset test

# `make` KHÔNG có sẵn trên Windows (F-03) nên ĐƯỜNG CHÍNH là `pnpm bootstrap`.
# Target này chỉ gọi lại nó — giữ MỘT danh sách bước duy nhất ở tools/setup.mjs.
# Bản trước liệt kê bước ở đây và thiếu 3 bước (env · build shared · generate),
# nên không chạy nổi trên clone sạch.
setup:
	pnpm bootstrap

up:
	docker compose -f docker-compose.dev.yml up -d --wait

down:
	docker compose -f docker-compose.dev.yml down

dev:
	pnpm dev

migrate:
	pnpm --filter @nexus/api prisma:migrate

seed:
	pnpm --filter @nexus/api prisma:seed

reset:
	docker compose -f docker-compose.dev.yml down -v
	$(MAKE) setup

test:
	pnpm test
