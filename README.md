# 🔍 MongoDB Search

This repository explores **different search capabilities on MongoDB** and **applications that build on them** — from simple search demos to **AI agent–based** solutions.

---

## 📑 Menu – Jump to a Topic

### 🚀 Demos & Apps

| | Topic | Description | Link |
|---|--------|-------------|------|
| 🤖 | **RAG Agent** | Full RAG app: film catalog, text/image embeddings, Q&A API (VoyageAI + Ollama) | [→ Agent README](src/agent/README.md) |
| 📄 | **Full-Text Search** | Simple demo: Atlas full-text search | [→ `src/search/fulltext.js`](src/search/fulltext.js) |
| 🧮 | **Vector Search** | Simple demo: semantic / vector search | [→ `src/search/vector.js`](src/search/vector.js) |
| 🔀 | **Hybrid Search** | Simple demo: vector + full-text combined | [→ `src/search/hybrid.js`](src/search/hybrid.js) |

### 📚 Documentation

| | Topic | Description | Link |
|---|--------|-------------|------|
| 🤖 | **Simple Agent Demo** | Minimal Ollama + LangChain example | [→ docs/agent.md](docs/agent.md) |
| 📐 | **RAG Patterns** | Advanced RAG patterns (parent-doc, hybrid, filtered, reranking, agentic) | [→ docs/patterns-rag.md](docs/patterns-rag.md) |
| 🧠 | **Model Patterns** | LLM usage patterns (zero-shot, few-shot, fine-tuning, alignment) | [→ docs/patterns-model.md](docs/patterns-model.md) |
| 🗺️ | **Roadmap** | Phased roadmap: RAG + model patterns (Phase 1 → 2 → 3) | [→ docs/patterns-road.md](docs/patterns-road.md) |
| 📊 | **Vector Indexes** | Single vs separate vector indexes (text/image, performance) | [→ docs/indices.md](docs/indices.md) |

### ⚡ Quick Links

- [▶️ Quick Start](#-quick-start)
- [🐳 Docker Compose](#-docker-compose)
- [📜 Scripts](#-scripts-packagejson)
- [🔗 References](#-references)
- [📄 License](#-license)

---

## 🎯 Objective

- **Search on MongoDB:** Try **full-text**, **vector (semantic)**, and **hybrid** search with MongoDB Atlas.
- **Richer applications:** Use them in **RAG** and **agent-style** flows — embeddings, retrieval by text or image, answers via LLM.

You get **small demos** per search type and a **full RAG agent** that uses them together.

---

## 📂 What’s in This Repo

| Area | Purpose |
|------|--------|
| 📁 **`src/search/`** | **Search demos** — one file per approach: [fulltext](src/search/fulltext.js), [vector](src/search/vector.js), [hybrid](src/search/hybrid.js). |
| 📁 **`src/agent/`** | **RAG Agent** — setup, seed (film catalog + embeddings), HTTP API. See [src/agent/README.md](src/agent/README.md). |
| 📁 **`docs/`** | **Docs** — [RAG patterns](docs/patterns-rag.md), [model patterns](docs/patterns-model.md), [roadmap](docs/patterns-road.md), [indexes](docs/indices.md), [agent demo](docs/agent.md). |

---

## ▶️ Quick Start

1. **Clone and install** (Node.js 18+):

   ```bash
   git clone https://github.com/ameksike/mongodb-search.git
   cd mongodb-search
   npm install
   ```

2. **Configure** — Create a `.env` at the project root (`MONGODB_URI`, VoyageAI, Ollama). Details: [src/agent/README.md](src/agent/README.md).

3. **Run the RAG agent:**

   ```bash
   npm run agent:setup
   npm run agent:download
   npm run agent:seed
   npm run agent:start
   ```

   Then call `POST /api/films/ask` with `{ "question": "..." }` — see [Agent README](src/agent/README.md).

---

## 📜 Scripts (package.json)

| Script | Description |
|--------|-------------|
| **Agentic Demo** | |
| `npm run agent:setup` | Create collection and vector search indexes. |
| `npm run agent:download` | Download placeholder cover images for seed data. |
| `npm run agent:seed` / `npm run agent:ingest` | Seed collection from [src/agent/data/films.js](src/agent/data/films.js). |
| `npm run agent:start` | Start the RAG API server. |
| **Search Types Demos** | |
| `npm run search:fulltext` | Run full-text search demo ([fulltext.js](src/search/fulltext.js)). |
| `npm run search:vector` | Run vector search demo ([vector.js](src/search/vector.js)). |
| `npm run search:hybrid` | Run hybrid (full-text + vector) search demo ([hybrid.js](src/search/hybrid.js)). |

Run all from the **project root**. Search demos read config from `.env` (see comments in each file).

---

## 🐳 Docker Compose

You can run the full stack or only some services with Docker Compose. Use a **`.env`** file at the project root so that secrets are not hardcoded; the examples below use **generic placeholders** (replace with your real values locally and never commit real secrets).

### Services

| Service       | Purpose                                      | Ports              |
|---------------|----------------------------------------------|--------------------|
| **mongo**     | MongoDB for RAG/films and change streams     | 27017              |
| **ollama**    | LLM (e.g. phi3:mini) for RAG answers         | 11434              |
| **minio**     | S3-compatible storage for film cover images  | 9000 (API), 9001 (console) |
| **agent-web** | HTTP API — same as `npm run agent:start`     | 3000 (or `PORT`)   |
| **agent-watch** | Change-stream trigger — same as `npm run agent:watch` | —                |

### Example `.env` (no real secrets)

Create a **`.env`** in the project root. Use **generic placeholders** like `password` or `your-api-key`; replace them with real values only on your machine and **do not commit** real credentials.

```env
# --- MongoDB (when using Docker mongo service, MONGODB_URI is overridden in compose) ---
MONGODB_URI=mongodb://mongo:27017
MONGODB_DB=rag
MONGODB_COLLECTION=films

# --- VoyageAI (required for agent-web and agent:seed) ---
VOYAGE_API_URL=https://api.voyageai.com/v1/embeddings
VOYAGE_API_KEY=your-voyage-api-key
VOYAGE_MODEL=voyage-4-large

# --- Ollama / LLM (agent-web uses LLM_URL from compose when running in Docker) ---
LLM_MODEL=phi3:mini
LLM_CALL=true

# --- MinIO (Docker): use same values as in docker-compose for agent-web/agent-watch ---
MINIO_ROOT_USER=admin
MINIO_ROOT_PASSWORD=password
STORE_BUCKET=films
STORE_ENDPOINT=http://minio:9000
STORE_DRIVER=MinIO
AWS_ACCESS_KEY_ID=admin
AWS_SECRET_ACCESS_KEY=password

# --- Optional ---
PORT=3000
KOZEN_TRIGGER_DATABASE=rag
KOZEN_TRIGGER_COLLECTION=films
KOZEN_TRIGGER_FILE=./src/agent/bin/watch.js
```

Keep **real** `VOYAGE_API_KEY` and any production passwords only in your local `.env` (and ensure `.env` is in `.gitignore`).

### How to start services

All commands are run from the **project root**. Build the app image once with:

```bash
docker compose build
```

Then choose one of the following.

**Start everything (mongo, ollama, minio, agent-web, agent-watch):**

```bash
docker compose up -d
```

**Start only infrastructure (no app containers):**

```bash
docker compose up -d mongo minio ollama
```

**Start only the web API** (needs mongo, ollama, minio — start them first or use `depends_on`):

```bash
docker compose up -d mongo ollama minio
docker compose up -d agent-web
```

Or in one line, selecting only the services you want:

```bash
docker compose up -d mongo minio ollama agent-web
```

**Start only the watch/trigger** (needs mongo and minio):

```bash
docker compose up -d mongo minio agent-watch
```

**Start a single service** (e.g. only MongoDB, or only MinIO):

```bash
docker compose up -d mongo
docker compose up -d minio
docker compose up -d ollama
```

**Use an alternate env file** (e.g. for staging):

```bash
docker compose --env-file .env.staging up -d
```

**View logs** (all services, or one):

```bash
docker compose logs -f
docker compose logs -f agent-web
docker compose logs -f agent-watch
```

**Stop all or specific services:**

```bash
docker compose down
docker compose stop agent-web agent-watch
```

**Access a container shell** (inspect files, run commands):

From **cmd** (Windows) or **PowerShell**:

```cmd
docker exec -it agent-web sh
```

From **bash** (Linux/macOS):

```bash
docker exec -it agent-web sh
```

Inside the container you get a shell in the app directory (`/app`). You can list files (`ls`, `dir`), run Node (`node -v`), or run npm scripts. Exit with `exit` or Ctrl+D.

To run a **single command** without opening a shell:

```cmd
docker exec agent-web ls -la /app
docker exec agent-web node -v
```

For **agent-watch** use the same with container name `agent-watch`:

```cmd
docker exec -it agent-watch sh
```

### Quick reference

| Goal                         | Command |
|-----------------------------|--------|
| All services                | `docker compose up -d` |
| Only DB + storage + LLM     | `docker compose up -d mongo minio ollama` |
| Only API (web)              | `docker compose up -d mongo minio ollama agent-web` |
| Only trigger (watch)        | `docker compose up -d mongo minio agent-watch` |
| Only MongoDB                | `docker compose up -d mongo` |
| Only MinIO                  | `docker compose up -d minio` |
| Only Ollama                 | `docker compose up -d ollama` |
| Build/rebuild app image     | `docker compose build` |
| Logs                        | `docker compose logs -f [service]` |
| Shell in agent-web          | `docker exec -it agent-web sh` |
| Stop                        | `docker compose down` |

After starting **agent-web**, the API is at `http://localhost:3000` (or the host port you set with `PORT`). Run **agent:setup** and **agent:seed** once (e.g. from the host with `npm run agent:setup` and `npm run agent:seed` using the same `.env` and `MONGODB_URI` pointing to `localhost:27017` if mongo is in Docker).

## OLLana
```
GET http://127.0.0.1:11434/api/tags
```
```json
{
  "models": [
    {
      "name": "phi3:mini",
      "model": "phi3:mini",
      "modified_at": "2026-02-20T09:39:45.1876434Z",
      "size": 2176178913,
      "digest": "4f222292793889a9a40a020799cfd28d53f3e01af25d48e06c5e708610fc47e9",
      "details": {
        "parent_model": "",
        "format": "gguf",
        "family": "phi3",
        "families": [
          "phi3"
        ],
        "parameter_size": "3.8B",
        "quantization_level": "Q4_0"
      }
    }
  ]
}
```
---

## MinIO
```
GET http://127.0.0.1:9001/login
```

## 🔗 References

### MongoDB search

- [What is MongoDB Search?](https://www.mongodb.com/docs/atlas/atlas-search/)
    - [Full-Text Search](https://www.mongodb.com/resources/basics/full-text-search)
    - [Hybrid Search](https://www.mongodb.com/docs/atlas/atlas-search/tutorial/hybrid-search/)
        - [Hybrid Search Explained](https://www.mongodb.com/resources/products/capabilities/hybrid-search)
        - [Perform Hybrid Search with MongoDB Vector Search and MongoDB Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/hybrid-search/vector-search-with-full-text-search/?interface=driver&language=nodejs&pipeline-stage=rank-fusion)
    - [Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
        - [Supercharge Self-Managed Apps With Search and Vector Search Capabilities](https://www.mongodb.com/company/blog/product-release-announcements/supercharge-self-managed-apps-search-vector-search-capabilities)
        - [Atlas Hybrid Search Tester](https://hybrid.sa.prod.corp.mongodb.com/)
        - [Atlas Hybrid Search Tester GitHub](https://github.com/JohnGUnderwood/atlas-hybrid-search)
        - [How to Index Fields for Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/?deployment-type=atlas&embedding=byo&interface=driver&language=python#how-to-index-fields-for-vector-search)
        - [Manage MongoDB Search Indexes](https://www.mongodb.com/docs/atlas/atlas-search/manage-indexes/?deployment-type=atlas&interface=driver&language=python)
  - [Install the MongoDB Controllers for Kubernetes Operator](https://www.mongodb.com/docs/kubernetes/current/tutorial/install-k8s-operator/)
### Tools
- LangChain
    - [LangChain Quickstart](https://docs.langchain.com/oss/javascript/langchain/quickstart)
    - [LangChain Chat](https://chat.langchain.com/)
- [oLLama](https://hub.docker.com/r/ollama/ollama)
- VoyageAI
    - [VoyageAI Embeddings](https://docs.voyageai.com/docs/embeddings)
    - [Manage Projects](https://dashboard.voyageai.com/organization/projects)
    - [Agentic Yield Analytics with MongoDB](https://www.mongodb.com/docs/atlas/architecture/current/solutions-library/agentic-yield-analytics/)
- MinIO
    - [How to Run MinIO in Docker (S3-Compatible Object Storage)](https://oneuptime.com/blog/post/2026-02-08-how-to-run-minio-in-docker-s3-compatible-object-storage/view)
    - [MinIO Docker: Setup Guide for S3-Compatible Object Storage](https://www.datacamp.com/tutorial/minio-docker)
---

## 📄 License

ISC – see [LICENSE](LICENSE).
