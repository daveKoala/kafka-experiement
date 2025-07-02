# Kafka Node.js Pipeline with KRaft

**See the Idiot Guide for a simpler version**

A modern streaming data pipeline using Apache Kafka in KRaft mode (no ZooKeeper), Node.js with TypeScript, and Docker.

## 🚀 Features

- **Modern Kafka Setup**: Uses KRaft mode (Kafka 7.5.0) - no ZooKeeper required
- **TypeScript**: Full TypeScript implementation with strict typing
- **Multi-Service Architecture**: Producer API, Consumer, and Kafka UI
- **Docker Containerization**: Multi-stage builds with security best practices
- **Health Checks**: Built-in health monitoring for all services
- **Monitoring**: Kafka UI for visual monitoring and topic management
- **Production Ready**: Non-root users, multi-stage builds, proper error handling

## 📋 Prerequisites

- Docker & Docker Compose
- Node.js 18+ (for local development)
- Make (optional, for convenience commands)

## 🏗️ Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Producer API  │───▶│      Kafka      │───▶│    Consumer     │
│   (Port 3000)   │    │  (KRaft Mode)   │    │   (Processing)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌─────────────────┐
                       │    Kafka UI     │
                       │   (Port 8080)   │
                       └─────────────────┘
```

## 🚀 Quick Start

### Using Make (Recommended)

```bash
# Start everything
make dev-infra

# Check status
make status

# View logs
make logs

# Test the API
make test-produce

# Start demo log generation
make test-demo

# Stop everything
make down
```

### Using Docker Compose Directly

```bash
# Start all services
docker-compose up -d

# Check logs
docker-compose logs -f

# Stop services
docker-compose down
```

### Local Development

```bash
# Install dependencies
npm install

# Copy environment file
cp .env.example .env

# Start development servers
npm run dev
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file from `.env.example`:

```bash
cp .env.example .env
```

### Kafka Topics

The system uses three main topics:

- `application-logs`: General application logs
- `application-errors`: Error-level logs for alerting
- `application-metrics`: Application metrics and performance data

## 📡 API Endpoints

### Producer API (Port 3000)

- `GET /health` - Health check
- `POST /logs` - Send a single log message
- `POST /logs/bulk` - Send multiple log messages
- `POST /metrics` - Send a metric
- `POST /start-demo` - Start demo log generation

### Example API Usage

```bash
# Send a log message
curl -X POST http://localhost:<PORT>/logs \
  -H "Content-Type: application/json" \
  -d '{
    "level": "info",
    "message": "User logged in",
    "metadata": {"userId": 123, "ip": "192.168.1.1"}
  }'

# Send a metric
curl -X POST http://localhost:<PORT>/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "name": "response_time",
    "value": 245,
    "tags": {"endpoint": "/api/users"}
  }'
```

## 🖥️ Monitoring

### Kafka UI

Access the Kafka UI at [http://localhost:8080](http://localhost:8080)

Features:

- Topic management and visualization
- Message browsing
- Consumer group monitoring
- Cluster health metrics

### Health Checks

All services include health checks:

```bash
# Check all services
make health

# Individual health checks
curl http://localhost:3000/health  # Producer API
docker-compose ps                  # Container status
```

### Project Structure

```
├── src/
│   ├── api.ts           # Express API server
│   ├── consumer.ts      # Kafka consumer
│   ├── server.ts        # Kafka producer
├── dist/                # Compiled JavaScript
├── logs/                # Application logs
├── docker-compose.dev.yml   # Service orchestration
├── docker-compose.yml   # Service orchestration
├── Dockerfile.*         # Container definitions
├── tsconfig.json        # TypeScript configuration
└── Makefile            # Development shortcuts
```

## 🐳 Docker Details

### Multi-Stage Builds

The Dockerfiles use multi-stage builds for optimal image size:

1. **Builder stage**: Installs all dependencies and compiles TypeScript
2. **Production stage**: Only includes runtime dependencies and compiled code

### Security Features

- Non-root user execution
- Minimal Alpine Linux base images
- Multi-stage builds to reduce attack surface
- Health checks for monitoring

### KRaft Configuration

Kafka runs in KRaft mode with these key settings:

- `KAFKA_PROCESS_ROLES: 'broker,controller'` - Combined broker/controller mode
- `KAFKA_CONTROLLER_QUORUM_VOTERS` - Consensus configuration
- No ZooKeeper dependency

## 🔍 Troubleshooting

### Common Issues

1. **Kafka not starting**: Check if port 9092 is available
2. **Consumer not receiving messages**: Verify topic creation and consumer group settings
3. **API connection refused**: Ensure Kafka is healthy before starting producers/consumers

### Useful Commands

```bash
# Check Kafka topics
make list-topics

# View specific service logs
make logs-kafka
make logs-api
make logs-consumer

# Reset everything
make clean-all
make up
```

### Kafka Settings

Key performance settings in docker-compose.yml:

- `KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 1` - Single node setup
- `KAFKA_GROUP_INITIAL_REBALANCE_DELAY_MS: 0` - Fast consumer startup
- `KAFKA_AUTO_CREATE_TOPICS_ENABLE: 'true'` - Automatic topic creation

### Scaling

To scale consumers:

```bash
docker-compose up --scale consumer=3
```
