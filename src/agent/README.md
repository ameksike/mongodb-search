# RAG Agent – Film Catalog Demo

This module is a **Retrieval-Augmented Generation (RAG)** solution that answers natural-language questions over a catalog of films. It uses **MongoDB Atlas Vector Search** for semantic retrieval (text and optional image embeddings), **VoyageAI** for text embeddings, and **Ollama** (via LangChain) as the LLM. Documents store both **text** and **image** vectors so you can search by question (text) or later by image similarity.

---

## What This Solution Does

- **Setup:** Creates a MongoDB collection and vector search indexes on `embedding.text` and `embedding.image`.
- **Seed:** Ingests a list of films (title, description, cover image path) from `src/agent/data/films.js`, computes text embeddings with VoyageAI, and stores documents with `embedding: { text, image }` (image vector can be added later or mirrored from text).
- **API:** Exposes `POST /api/films/ask`: the user sends a question, the server embeds it, runs vector search on the text index, retrieves top-k films, and the LLM answers using that context. Responses include the answer and the retrieved films (title, description, coverImage, score).
- **Films CRUD:** `GET/POST/PUT/DELETE /api/films` for managing films. Accepts **JSON** (`Content-Type: application/json`) or **multipart/form-data** (field `coverImage` for file upload). When a cover image file is sent and S3 is configured, it is uploaded to AWS S3 and the returned URL is stored in `coverImage`.

All runnable commands are defined in the project root **`package.json`** and must be run from the **project root** (not from `src/agent`).

---

## Prerequisites

- **Node.js 18+** (ESM)
- **MongoDB Atlas** cluster (for Vector Search indexes)
- **VoyageAI** API key (for text embeddings)
- **Ollama** running locally with a model (e.g. `phi3:mini`): `ollama run phi3:mini`

---

## Environment Variables

Create a **`.env`** file at the **project root** with at least:

```env
# Required
MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/yourdb?retryWrites=true&w=majority

# Optional (defaults shown)
MONGODB_DB=rag
MONGODB_COLLECTION=films
PORT=3000

# VoyageAI (required for server and seed)
VOYAGE_API_URL=https://api.voyageai.com/v1/embeddings
VOYAGE_API_KEY=your-voyage-api-key
VOYAGE_MODEL=voyage-4-large

# Ollama LLM (required for server)
LLM_MODEL=phi3:mini
LLM_CALL=true

# Kozen options
KOZEN_LOG_LEVEL=INFO
KOZEN_LOG_TYPE=object
KOZEN_MODULE_LOAD=@kozen/trigger
KOZEN_TRIGGER_FILE=./src/agent/bin/watch.js
KOZEN_TRIGGER_DATABASE=rag
KOZEN_TRIGGER_COLLECTION=films
KOZEN_TRIGGER_URI=MONGODB_URI

# S3-compatible storage (optional – for film cover image uploads via multipart/form-data)
# Use either AWS S3 or local MinIO (e.g. docker-compose minio service).
STORE_BUCKET=films
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# For local MinIO (docker-compose): uncomment and use MinIO credentials
# STORE_ENDPOINT=http://localhost:9000
# AWS_ACCESS_KEY_ID=admin
# AWS_SECRET_ACCESS_KEY=admin12345
# Optional: custom public URL base (e.g. CloudFront or MinIO URL)
# STORE_PUBLIC_BASE_URL=https://d123.cloudfront.net
# STORE_PUBLIC_BASE_URL=http://localhost:9000/films
```

For **setup** you can optionally set:

- `VECTOR_INDEX_NAME` (default `rag_vector`) – base name for indexes (e.g. `rag_vector_text_index`, `rag_vector_image_index`)
- `VECTOR_DIMENSIONS` (default `1024`) – used for both text and image if not overridden
- `VECTOR_DIMENSIONS_TEXT`, `VECTOR_DIMENSIONS_IMAGE` – separate dimensions for text and image embeddings
- `VECTOR_SIMILARITY` – e.g. `cosine`, `euclidean`, `dotProduct`
- `MONGODB_VECTOR_VALIDATION` – set to `true` to enable collection schema validation

---

## npm Scripts (package.json)

Run every command from the **project root**:

| Script                            | Command                                        | Purpose                                                                                                                                       |
| --------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| **agent:setup**                   | `npm run agent:setup`                          | Creates the MongoDB collection and vector search indexes (`embedding.text`, `embedding.image`). Run once (or when changing index/dimensions). |
| **agent:download**                | `npm run agent:download`                       | Downloads placeholder cover images into `src/agent/data/img/` (poster-001.jpg …). Run once if you use the bundled film list.                  |
| **agent:seed** / **agent:ingest** | `npm run agent:seed` or `npm run agent:ingest` | Loads films from `src/agent/data/films.js`, computes text embeddings via VoyageAI, and inserts documents into the collection.                 |
| **agent:start**                   | `npm run agent:start`                          | Starts the RAG API server (Express). Requires MongoDB, VoyageAI, and Ollama configured.                                                       |

**Suggested order:**  
`agent:setup` → `agent:download` → `agent:seed` → `agent:start`

---

## How to Use

### 1. One-time setup (collection + indexes)

```bash
npm run agent:setup
```

This uses `src/agent/bin/setup.js` and the **SetupService** to create the collection and the vector search indexes.

### 2. Download cover images (optional)

```bash
npm run agent:download
```

This runs `src/agent/bin/download.js` and fills `src/agent/data/img/` with placeholder poster images used by the seed data.

### 3. Seed the film catalog

```bash
npm run agent:seed
```

(or `npm run agent:ingest` – same script). This reads `src/agent/data/films.js`, embeds each film’s text with VoyageAI, and inserts documents with `embedding: { text, image }` (image can be the same as text until you add an image embedding pipeline).

### 4. Start the API server

```bash
npm run agent:start
```

The server listens on `http://localhost:${PORT}` (default 3000).

**Health check:**

```bash
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`

### 5. Ask a question (RAG Q&A)

**Request:** `POST /api/films/ask` with JSON body:

```json
{
  "question": "What is the movie about a general who is forced to become a warrior fighting for his life"
}
```

**Example (cURL):**

```bash
curl -X POST http://localhost:3000/api/films/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What is the movie about a general who is forced to become a warrior fighting for his life?\"}"
```

**Example (PowerShell):**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/films/ask" `
  -ContentType "application/json" `
  -Body '{"question": "What is the movie about a general who is forced to become a warrior fighting for his life?"}'
```

**Example response:**

```json
{
  "answer": "The movie is Gladiator. A former Roman general is betrayed...",
  "contextChunks": [
    {
      "title": "Gladiator",
      "description": "Gladiator. A former Roman general is betrayed and reduced to slavery...",
      "coverImage": "img/poster-016.jpg",
      "score": 0.7211229205131531
    },
    {
      "title": "The Matrix",
      "description": "The Matrix. A computer hacker learns from rebels about the...",
      "coverImage": "img/poster-007.jpg",
      "score": 0.6721935868263245
    },
    {
      "title": "Fight Club",
      "description": "Fight Club. An insomniac office worker and a devil-may-care...",
      "coverImage": "img/poster-010.jpg",
      "score": 0.6635963916778564
    },
    {
      "title": "Alien",
      "description": "Alien. The crew of a commercial spacecraft encounter a deadly...",
      "coverImage": "img/poster-021.jpg",
      "score": 0.650110125541687
    }
  ]
}
```

---

## API Summary

| Method | Path           | Description                                                                                                                          |
| ------ | -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/health`  | Health check. Returns `{ "status": "ok" }`.                                                                                          |
| POST   | `/api/films/ask` | RAG Q&A. Body: `{ "question": "..." }`. Returns `{ "answer", "contextChunks" }` (each chunk: title, description, coverImage, score). |

---

## Document Shape (MongoDB)

Each stored document has the form:

```json
{
  "_id": "<ObjectId>",
  "title": "Film Title",
  "description": "Description of the film",
  "coverImage": "img/poster-001.jpg",
  "embedding": {
    "text": [0.1, 0.3, ...],
    "image": [0.12, 0.45, ...]
  }
}
```

- **embedding.text** – vector from the text embedding model (e.g. VoyageAI); used for question-based search.
- **embedding.image** – vector from the image embedding model (e.g. CLIP); can be filled later or duplicated from text for the demo.

---

## Project Structure (src/agent)

| Path             | Role                                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **bin/**         | Runnable entry points: `server.js` (API), `ingest.js` (seed), `setup.js` (collection + indexes), `download.js` (poster images). |
| **controllers/** | `RagController.js` – Express routes for `/api/films/ask`.                                                                         |
| **services/**    | `RagService`, `SeedService`, `SetupService`, `VoyageAIService`, `OllamaService` – business logic and external APIs.             |
| **data/**        | `films.js` – list of films (title, url, coverImage, text). `img/` – cover images (e.g. poster-001.jpg …).                       |
| **utils/**       | `logger.js` – standardized logging.                                                                                             |

Conventions and context are maintained in the project’s **`tmp/context.md`**.
