# 🐳 Docker Compose Deployment Guide

Run **mongodb-search** locally with Docker Compose.

## 📋 Prerequisites

- Docker Engine 20+ with Docker Compose v2
- A `.env` file in the project root (see below)

## 🔐 1. Configure Environment

Copy the example values and edit `.env` in the project root:

```bash
cp .env.example .env   # or create manually
```

Key variables to set:

| Variable | Description | Example |
|----------|-------------|---------|
| `MONGODB_URI` | MongoDB connection string | `mongodb+srv://user:pass@host` |
| `MONGODB_DB` | Database name | `rag` |
| `MONGODB_COLLECTION` | Collection name | `films` |
| `VOYAGE_API_KEY` | VoyageAI API key | `pa-xxxx` |
| `LLM_CALL` | Enable LLM calls | `false` |
| `LLM_MODEL` | Ollama model name | `phi3:mini` |

> 💡 MinIO credentials default to `admin` / `admin12345`. Change them via `MINIO_ROOT_USER` and `MINIO_ROOT_PASSWORD` in `.env`.

## 🚀 2. Start All Services

```bash
docker compose up -d
```

This starts:

| Service | Port | Description |
|---------|------|-------------|
| 🤖 `ollama` | `11434` | LLM inference (auto-pulls `phi3:mini`) |
| 📦 `minio` | `9000` / `9001` | S3-compatible storage (API / Console) |
| 🌐 `agent-web` | `3000` | REST API server |
| 👁️ `agent-watch` | — | MongoDB change stream listener |

## ✅ 3. Verify

```bash
# Check running containers
docker compose ps

# View logs for all services
docker compose logs -f

# View logs for a specific service
docker compose logs -f agent-web
```

## 🌐 4. Access

| Resource | URL |
|----------|-----|
| 🌐 API | http://localhost:3000 |
| 📦 MinIO Console | http://localhost:9001 |
| 🤖 Ollama API | http://localhost:11434 |

## 🔧 5. Seed Data

After the services are running, seed the database:

```bash
# Run setup (creates indexes, search indexes, etc.)
docker compose exec agent-web npm run agent:setup

# Ingest sample data
docker compose exec agent-web npm run agent:seed
```

## 🔄 6. Rebuild After Code Changes

```bash
docker compose up -d --build
```

## ⏹️ 7. Stop Services

```bash
# Stop (keep data)
docker compose down

# Stop and remove volumes (⚠️ deletes all data)
docker compose down -v
```

## 📂 Data Persistence

Data is stored in the `./tmp/` directory:

| Path | Service |
|------|---------|
| `./tmp/ollama` | Ollama model files |
| `./tmp/minio` | MinIO object storage |

> 💡 To reset data, stop services and delete `./tmp/`.

## 🐛 Troubleshooting

**Ollama model not loading?**
```bash
# Manually pull the model
docker compose exec ollama ollama pull phi3:mini
```

**MinIO bucket not created?**
```bash
# Access MinIO console at http://localhost:9001
# Login: admin / admin12345
# Create the "films" bucket manually
```

**agent-web can't connect to MongoDB?**
- Verify `MONGODB_URI` in `.env` is correct
- Ensure your IP is whitelisted in MongoDB Atlas network access
