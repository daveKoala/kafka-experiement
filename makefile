.PHONY: help build up down logs clean restart status dev-infra dev-stop

# Default target
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  %-15s %s\n", $1, $2}' $(MAKEFILE_LIST)

# Docker Compose operations
build: ## Build all containers
	docker-compose build

up: ## Start all services
	docker-compose up -d

down: ## Stop all services
	docker-compose down

# Development operations
dev-infra: ## Start only Kafka and Kafka UI for local development
	docker-compose -f docker-compose.dev.yml up -d

dev-stop: ## Stop development infrastructure
	docker-compose -f docker-compose.dev.yml down

dev: ## Start development environment (infrastructure + local apps)
	make dev-infra
	@echo "Waiting for Kafka to be ready..."
	@sleep 10
	npm run dev

build-ts: ## Build TypeScript
	npm run build

clean: ## Clean up containers and volumes
	docker-compose down -v
	docker-compose -f docker-compose.dev.yml down -v
	docker system prune -f

restart: ## Restart all services
	docker-compose restart

# Status and monitoring
status: ## Show status of all services
	@echo "Production containers:"
	@docker-compose ps
	@echo ""
	@echo "Development containers:"
	@docker-compose -f docker-compose.dev.yml ps

logs: ## Follow logs from all services
	docker-compose logs -f

logs-api: ## Follow logs from producer-api service
	docker-compose logs -f producer-api

logs-consumer: ## Follow logs from consumer service
	docker-compose logs -f consumer

logs-kafka: ## Follow logs from kafka service
	docker-compose logs -f kafka

logs-kafka-dev: ## Follow logs from development kafka
	docker-compose -f docker-compose.dev.yml logs -f kafka

# Health checks
health: ## Check health of all services
	@echo "Checking Kafka..."
	@curl -s http://localhost:8080 > /dev/null && echo "✅ Kafka UI is healthy" || echo "❌ Kafka UI is not responding"
	@echo "Checking Producer API..."
	@curl -s http://localhost:3000/health | grep -q "healthy" && echo "✅ Producer API is healthy" || echo "❌ Producer API is not healthy"

health-dev: ## Check health of development services
	@echo "Checking Kafka (dev)..."
	@curl -s http://localhost:8080 > /dev/null && echo "✅ Kafka UI is healthy" || echo "❌ Kafka UI is not responding"
	@echo "Checking local apps..."
	@curl -s http://localhost:3000/health | grep -q "healthy" && echo "✅ Producer API is healthy" || echo "❌ Producer API is not healthy"

# Topic management
create-topics: ## Create Kafka topics
	docker-compose exec kafka kafka-topics --create --topic application-logs --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
	docker-compose exec kafka kafka-topics --create --topic application-metrics --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1
	docker-compose exec kafka kafka-topics --create --topic application-errors --bootstrap-server localhost:9092 --partitions 3 --replication-factor 1

list-topics: ## List all Kafka topics
	docker-compose exec kafka kafka-topics --list --bootstrap-server localhost:9092

list-topics-dev: ## List all Kafka topics (dev)
	docker-compose -f docker-compose.dev.yml exec kafka kafka-topics --list --bootstrap-server localhost:9092

# Testing
test-produce: ## Send a test log message
	curl -X POST http://localhost:8081/logs \
		-H "Content-Type: application/json" \
		-d '{"level": "info", "message": "Test message from Makefile", "metadata": {"source": "makefile"}}'

test-demo: ## Start demo log generation
	curl -X POST http://localhost:3000/start-demo \
		-H "Content-Type: application/json" \
		-d '{"duration": 60}'

# Cleanup
clean-all: ## Remove everything including images
	docker-compose down -v --rmi all
	docker-compose -f docker-compose.dev.yml down -v --rmi all
	docker system prune -af