# RAG Agent Demo

This document describes a Retrieval-Augmented Generation (RAG) architecture built on MongoDB Atlas Vector Search, Node.js 18+, LangChain, VoyageAI embeddings, and an Ollama LLM accessed via ChatOllama.

## High-Level Architecture

![](../../docs/img/rag_solution_architecture_diagram.png)

---

## Prerequisites

- **Node.js 18+** (ESM)
- **MongoDB Atlas** with a collection and a **vector search index** on the `embedding` field (e.g. index name `rag_vector_index`)
- **VoyageAI** API key for embeddings
- **Ollama** running locally with a model (e.g. `phi3:mini`): `ollama run phi3:mini`

---

## Setup

1. **Install dependencies** (from the project root):

   ```bash
   npm install
   ```

2. **Configure environment.** Create a `.env` file in the project root with:

   ```env
   MONGODB_URI=mongodb+srv://user:password@cluster.mongodb.net/yourdb?retryWrites=true&w=majority
   MONGODB_DB=rag
   MONGODB_COLLECTION=chunks

   VOYAGE_API_URL=https://api.voyageai.com/v1/embeddings
   VOYAGE_API_KEY=your-voyage-api-key
   VOYAGE_MODEL=voyage-4-large

   OLLAMA_MODEL=phi3:mini
   ```

   Replace placeholders with your real MongoDB URI, VoyageAI key, and desired Ollama model.

---

## How to Use This Demo

### 1. Start the RAG API server

From the project root:

```bash
npm run agent:start
```

The server listens on `http://localhost:3000` (or the port set in `PORT` in `.env`).

**Check health:**

```bash
curl http://localhost:3000/api/health
```

Expected: `{"status":"ok"}`

---

### 2. Ingest documents (optional, if the collection is empty)

Ingest chunks documents so the RAG has content to search. From the project root:

```bash
npm run agent:ingest
```

By default, the ingest script loads seed documents from `src/agent/data/seedDocuments.js`. To add your own content, add entries to that array (or run a custom script that uses `SeedService` from `src/agent/services/SeedService.js`). Each document must have this shape:

```js
{
  sourceId: 'unique-doc-id',
  title: 'Document Title',
  url: 'https://example.com/doc',
  text: 'Full plain text of the document to chunk and embed...'
}
```

Each document is split into chunks, embedded with VoyageAI, and stored in MongoDB.

---

### 3. Ask questions (RAG Q&A)

Send a question to the RAG endpoint. The server embeds the question, runs vector search, and returns an answer plus the retrieved context chunks.

**Using cURL:**

```bash
curl -X POST http://localhost:3000/api/rag/ask \
  -H "Content-Type: application/json" \
  -d "{\"question\": \"What is the product manual about?\"}"
```

**Using PowerShell:**

```powershell
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/rag/ask" `
  -ContentType "application/json" `
  -Body '{"question": "What is the product manual about?"}'
```

**Example response:**

```json
{
  "answer": "Based on the context, the manual covers...",
  "contextChunks": [
    {
      "content": "Chunk text...",
      "metadata": { "title": "Product Manual", "url": "https://example.com/manual" },
      "score": 0.89
    }
  ]
}
```

**Using JavaScript (fetch):**

```js
const res = await fetch('http://localhost:3000/api/rag/ask', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question: 'What is the product manual about?' }),
});
const data = await res.json();
console.log(data.answer);
console.log(data.contextChunks);
```

---

## API Summary

| Method | Path             | Description                    |
|--------|------------------|--------------------------------|
| GET    | `/api/health`    | Health check                   |
| POST   | `/api/rag/ask`   | RAG Q&A; body: `{ "question": "..." }` |

All project and agent conventions are kept in `tmp/context.md`.
