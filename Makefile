# BabyApp — local dev & deploy shortcuts (Docker Compose).
#
# First time:      make setup
# Day to day:      make up / make down / make logs / make ps
# Maintenance:     make migrate / make sync-functions / make reset

SHELL := /bin/bash
.DEFAULT_GOAL := help

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## One-shot setup: env, functions sync, build, up, wait, migrate
	bash scripts/setup-docker.sh

up: ## Build (if needed) and start everything
	docker compose up -d --build

down: ## Stop everything (data is kept)
	docker compose down

restart: ## Restart all services
	docker compose restart

logs: ## Tail logs from all services
	docker compose logs -f --tail=100

ps: ## Service status
	docker compose ps

build: ## Rebuild the web image (pick up .env / code changes)
	docker compose build web

migrate: ## (Re)apply supabase/migrations — idempotent
	bash scripts/apply-migrations.sh

sync-functions: ## Copy supabase/functions/* into the docker edge-runtime volume
	bash scripts/sync-functions.sh

deploy-barry: sync-functions ## Sync functions and restart the edge runtime
	docker compose up -d functions

studio: ## Open the Supabase Studio dashboard URL in your browser
	@echo "open: http://localhost:$${KONG_HTTP_PORT:-8000}/studio  (user/password in docker/supabase/.env)"
	@xdg-open "http://localhost:$${KONG_HTTP_PORT:-8000}/studio" 2>/dev/null || true

reset: ## DANGER: stop and destroy ALL local data (db, volumes, generated .env)
	docker compose down -v --remove-orphans
	rm -rf docker/supabase/volumes/db/data
	rm -f docker/supabase/.env
	@echo "stack torn down; 'make setup' to start fresh"

.PHONY: help setup up down restart logs ps build migrate sync-functions deploy-barry studio reset
