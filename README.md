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

- [▶️ Quick Start](#-quick-start) · [📜 Scripts](#-scripts-packagejson) · [🔗 References](#-references) · [📄 License](#-license)

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

   Then call `POST /api/rag/ask` with `{ "question": "..." }` — see [Agent README](src/agent/README.md).

---

## 📜 Scripts (package.json)

| Script | Description |
|--------|-------------|
| `npm run agent:setup` | Create collection and vector search indexes. |
| `npm run agent:download` | Download placeholder cover images for seed data. |
| `npm run agent:seed` / `npm run agent:ingest` | Seed collection from [src/agent/data/films.js](src/agent/data/films.js). |
| `npm run agent:start` | Start the RAG API server. |

Run all from the **project root**.

---

## 🔗 References

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

## 📄 License

ISC – see [LICENSE](LICENSE).
