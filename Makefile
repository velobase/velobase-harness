.PHONY: help db db-stop db-init db-reset build

help:
	@echo "Available commands:"
	@echo "  make db            - Start local PostgreSQL + Redis (Docker Compose)"
	@echo "  make db-stop       - Stop local database containers"
	@echo "  make db-init       - Incremental sync schema + seed (safe to run repeatedly)"
	@echo "  make db-reset      - Destroy all data and re-initialize from scratch"
	@echo "  make build         - Build Next.js application"

db:
	docker compose up -d

db-stop:
	docker compose down

db-init:
	docker compose up -d
	pnpm db:push
	pnpm db:seed

db-reset:
	docker compose down -v
	docker compose up -d
	pnpm db:push
	pnpm db:seed

build:
	pnpm build

