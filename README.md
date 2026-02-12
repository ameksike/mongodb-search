# MongoDB Search

This repository explores **different search capabilities on MongoDB** and **applications that build on them**, from simple search demos to more complex **AI agent–based** solutions.

---

## Objective

- **Search on MongoDB:** Try out and compare **full-text search**, **vector (semantic) search**, and **hybrid search** using MongoDB Atlas (and compatible deployments).
- **Richer applications:** Use those building blocks in **RAG (Retrieval-Augmented Generation)** and **agent-style** flows: embed content, store vectors, retrieve by question or by image, and answer with an LLM.

The code is organized so you can run **small, focused demos** for each search type and a **full RAG agent** that ties them together.

---

## What’s in This Repo

| Area | Purpose |
|------|--------|
| **`src/search/`** | **Simple search demos** – one approach per file. Intended to show how each kind of search works in isolation (full-text, vector, hybrid). |
| **`src/agent/`** | **RAG + agent-style app** – end-to-end flow: setup (collection + vector indexes), seed data (e.g. film catalog with text/image embeddings), HTTP API to ask questions and get answers grounded in retrieved documents. Uses MongoDB vector search, VoyageAI embeddings, and Ollama (LangChain). See [src/agent/README.md](src/agent/README.md) for details. |
| **`docs/`** | Notes, patterns, and diagrams (e.g. RAG patterns, indices, roadmap). |

---

## Quick Start

1. **Clone and install** (Node.js 18+):

   ```bash
   git clone <repo-url>
   cd mongodb-search
   npm install
   ```

2. **Configure** – Create a `.env` at the project root with at least `MONGODB_URI`, plus VoyageAI and Ollama settings if you run the agent (see [src/agent/README.md](src/agent/README.md)).

3. **Run the RAG agent** (setup → download images → seed → start API):

   ```bash
   npm run agent:setup
   npm run agent:download
   npm run agent:seed
   npm run agent:start
   ```

   Then call `POST /api/rag/ask` with `{ "question": "..." }` (see agent README for full usage).

---

## Scripts (package.json)

| Script | Description |
|--------|-------------|
| `npm run agent:setup` | Create MongoDB collection and vector search indexes for the agent. |
| `npm run agent:download` | Download placeholder cover images for the agent’s seed data. |
| `npm run agent:seed` / `npm run agent:ingest` | Seed the agent’s collection from `src/agent/data/films.js`. |
| `npm run agent:start` | Start the RAG API server (Express). |

All commands are run from the **project root**.

---

## References

### MongoDB search

- [What is MongoDB Search?](https://www.mongodb.com/docs/atlas/atlas-search/)
    - [Full-Text Search](https://www.mongodb.com/resources/basics/full-text-search)
    - [Hybrid Search](https://www.mongodb.com/docs/atlas/atlas-search/tutorial/hybrid-search/)
    - [Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-overview/)
        - [Supercharge Self-Managed Apps With Search and Vector Search Capabilities](https://www.mongodb.com/company/blog/product-release-announcements/supercharge-self-managed-apps-search-vector-search-capabilities)
        - [Atlas Hybrid Search Tester](https://hybrid.sa.prod.corp.mongodb.com/)
        - [Atlas Hybrid Search Tester GitHub](https://github.com/JohnGUnderwood/atlas-hybrid-search)
        - [How to Index Fields for Vector Search](https://www.mongodb.com/docs/atlas/atlas-vector-search/vector-search-type/?deployment-type=atlas&embedding=byo&interface=driver&language=python#how-to-index-fields-for-vector-search)
        - [Manage MongoDB Search Indexes](https://www.mongodb.com/docs/atlas/atlas-search/manage-indexes/?deployment-type=atlas&interface=driver&language=python)

### AI / RAG / Agents
- LangChain
    - [LangChain Quickstart](https://docs.langchain.com/oss/javascript/langchain/quickstart)
    - [LangChain Chat](https://chat.langchain.com/)
- [oLLama](https://hub.docker.com/r/ollama/ollama)
- VoyageAI
    - [VoyageAI Embeddings](https://docs.voyageai.com/docs/embeddings)
    - [Manage Projects](https://dashboard.voyageai.com/organization/projects)
- [Agentic Yield Analytics with MongoDB](https://www.mongodb.com/docs/atlas/architecture/current/solutions-library/agentic-yield-analytics/)

---

## License

ISC – see [LICENSE](LICENSE).
