# README cam kết: make setup xong trong dưới 30 phút, quá là bug của repo.
SHELL := /bin/sh

.PHONY: setup dev up down migrate seed reset test

setup: up
	pnpm install
	pnpm --filter @nexus/api prisma:migrate
	pnpm --filter @nexus/api prisma:seed

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
