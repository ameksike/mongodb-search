# MongoDB Edition Compatibility

Atlas Search and Vector Search are powered by **mongot**, a Java-based sidecar process built on Apache Lucene that runs alongside `mongod`. Understanding this architectural detail determines which features are available on each MongoDB deployment and why — and clarifies that most of this application works identically across every edition.

---

## What mongot is and what it powers

`mongot` is a separate OS-level process that `mongod` communicates with internally. MongoDB Inc. manages its lifecycle automatically in Atlas; in Enterprise Advanced (EA) you deploy and configure it yourself; in Community Edition (CE) it is not available at all.

The sidecar handles exclusively the search-related aggregation stages and the Search Index Management API. Every other MongoDB capability — CRUD operations, standard aggregation pipelines, B-tree indexes, schema validation, change streams, transactions — runs inside `mongod` directly and has no dependency on `mongot`.

```
┌─────────────────────────────────┐
│       Your application          │
└────────────┬────────────────────┘
             │ MongoDB driver (standard wire protocol)
             ▼
┌─────────────────────────────────────────────────────────┐
│  mongod  (the usual MongoDB server)                     │
│  ┌───────────────────────────────────────────────────┐  │
│  │  CRUD, aggregation, indexes B-tree, etc.          │  │
│  └───────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────┐  │
│  │  mongot  (sidecar — configuration required)       │  │
│  │  • $vectorSearch  (vector + ANN)                  │  │
│  │  • $search        (Lucene full-text)              │  │
│  │  • $rankFusion    (multi-pipeline rank fusion)    │  │
│  │  • Search Index Management API                    │  │
│  │    (createSearchIndex / listSearchIndexes / drop) │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

The four operations that require mongot are the only source of incompatibility between this application and deployments that do not run it. Everything else compiles down to standard wire-protocol commands that work on any edition.

---

## What is and is not affected in this project

The application has two independent functional layers. The data layer — collection creation, schema validation, document ingestion with embeddings, and the Film CRUD API — has no dependency on mongot and works identically across Atlas, EA, and CE. The Voyage AI embedding service, the Ollama LLM integration, and the MinIO/S3 store are external services; MongoDB edition is irrelevant to them.

The RAG layer is where mongot matters. `RagService` uses `$vectorSearch` to retrieve semantically similar documents by embedding, `$search` for keyword-based full-text retrieval, and merges both result sets using Reciprocal Rank Fusion for hybrid queries. `SetupService` uses the Search Index Management API (`createSearchIndex`, `listSearchIndexes`, `dropSearchIndex`) to provision vector and full-text indexes at startup. None of these operations are available without mongot.

```javascript
// These four operations require mongot — nothing else in this project does

// 1. Provision a vector index (SetupService)
await collection.createSearchIndex({
    name: 'rag_vector_text_index',
    type: 'vectorSearch',
    definition: { fields: [{ type: 'vector', path: 'embedding.text', numDimensions: 1024, similarity: 'cosine' }] }
});

// 2. Probe index availability (SetupService)
const cursor = collection.listSearchIndexes();

// 3. Semantic retrieval (RagService)
{ $vectorSearch: { index: 'rag_vector_text_index', path: 'embedding.text', queryVector: [...], numCandidates: 100, limit: 5 } }

// 4. Full-text retrieval (RagService)
{ $search: { index: 'title_description_index', text: { query: 'sci-fi thriller', path: ['title', 'description'] } } }
```

---

## Compatibility matrix

| Feature | Atlas M10+ | Atlas M0/M2 | EA + mongot | EA (no mongot) | CE |
|---------|:----------:|:-----------:|:-----------:|:--------------:|:--:|
| CRUD (find, insert, update, delete) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Schema validation (`$jsonSchema`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Film CRUD API (`/api/films`) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Document ingestion with embeddings | ✅ | ✅ | ✅ | ✅ | ✅ |
| VoyageAI embeddings | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ollama LLM integration | ✅ | ✅ | ✅ | ✅ | ✅ |
| `$vectorSearch` | ✅ | ❌ | ✅ | ❌ | ❌ |
| `$search` (full-text) | ✅ | ❌ | ✅ | ❌ | ❌ |
| `$rankFusion` | ✅ | ❌ | ✅ | ❌ | ❌ |
| Search Index Management API | ✅ | ❌ | ✅ | ❌ | ❌ |
| RAG queries (`/ask`, `/ask/text`, `/ask/image`, `/ask/hybrid`) | ✅ | ❌ | ✅ | ❌ | ❌ |

Atlas M0/M2 (free tier) does not provision mongot, so it shares the same limitations as EA-without-mongot and CE despite being a managed cloud service. EA with mongot configured is functionally equivalent to Atlas M10+ for every feature this project uses.

---

## Capability detection at runtime

The application detects search availability through **probing**, not by inspecting the URI or reading a product-name environment variable. URI parsing is unreliable for this purpose: an `+srv` prefix confirms an Atlas connection but not the tier (M0 does not support search); a standard `mongodb://` URI could be CE, EA-without-mongot, or EA-with-mongot, all of which behave differently. The product-SKU boundary is therefore less meaningful than whether mongot is reachable.

On the first call to `listSearchIndexes()`, `SetupService` attempts the operation and records the result as a session-scoped flag. If the call fails — because the Search Index Management service is unreachable — the flag `_searchUnsupported` is set to `true`, all subsequent index operations are skipped without retrying, and the setup exits with a warning rather than an error. If the probe succeeds, the application proceeds identically regardless of whether it is talking to Atlas, EA, or a local `atlas deployments start` cluster.

```javascript
// SetupService — probe on first use, then reuse the result
async listSearchIndexes(collection) {
    if (this._searchUnsupported) return [];
    const existing = [];
    try {
        const indexes = collection.listSearchIndexes();
        for await (const idx of indexes) existing.push(idx);
    } catch (err) {
        logger.warn(COMPONENT, 'Search Index Management unavailable', { reason: err.message });
        if (!this._searchForced) this._searchUnsupported = true;
        return [];
    }
    logger.info(COMPONENT, 'Existing search indexes', { count: existing.length });
    return existing;
}
```

`RagService.retrieveRelevantChunks()` applies the same principle at query time: `$vectorSearch` is wrapped in a try/catch that returns an empty array on failure. This prevents a server crash when the endpoint is called against a deployment without mongot. `retrieveByFullText()` already had equivalent protection. Hybrid mode merges the two result sets with Reciprocal Rank Fusion; if both return empty, the LLM receives no context and generates a generic response — the API contract is preserved.

---

## Controlling search with `MONGODB_SEARCH`

The `MONGODB_SEARCH` environment variable overrides the auto-probe when the default behaviour is not suitable.

| Value | Behaviour |
|-------|-----------|
| _(unset)_ | Auto-probe on first `agent:setup` run |
| `auto` | Same as unset |
| `true` or `1` | Assume search is supported; skip probe; errors at index creation are still caught |
| `false` or `0` | Skip all search index operations immediately; suppresses probe warning |

Set `MONGODB_SEARCH=false` when running against CE or EA-without-mongot to suppress the probe warning that would otherwise appear on every `agent:setup` run. Set `MONGODB_SEARCH=true` only to force a retry when a transient network issue caused the probe to fail on a deployment that does support search.

```env
# .env — Atlas M10+ or EA with mongot (probe succeeds, value can be omitted)
MONGODB_SEARCH=auto

# EA without mongot or CE — suppress probe
MONGODB_SEARCH=false

# Force index creation even if probe returned a transient failure
MONGODB_SEARCH=true
```

---

## Deployment prerequisites by edition

### Atlas M10+ and above

No additional setup is required. `mongot` is provisioned and managed by Atlas. Run the standard setup command and all collection and index creation proceeds automatically:

```sh
npm run agent:setup
npm run agent:seed
npm run agent:start
```

### Enterprise Advanced with mongot

EA supports the full feature set when mongot is deployed alongside `mongod`. MongoDB provides mongot as part of the Atlas CLI local deployment tooling (`atlas deployments start`) and as a separate package for self-managed installations. Verify mongot is reachable before running setup — a failed health check here explains any "Error connecting to Search Index Management service" log entries:

```sh
# Confirm mongot is listening (default port 28000)
curl http://localhost:28000/health
```

If the health check fails, set up mongot following the [MongoDB Atlas Search documentation](https://www.mongodb.com/docs/atlas/atlas-search/atlas-search-overview/) and retry. Once running, no application code changes are needed.

### Enterprise Advanced without mongot

The application starts and the data layer works fully — collection creation, document ingestion, and the Film CRUD API all function normally. Setup logs a warning and skips index creation. RAG query endpoints return empty context. Add `MONGODB_SEARCH=false` to `.env` to document this intent and suppress the warning:

```env
MONGODB_SEARCH=false
```

### Community Edition

Identical behaviour to EA without mongot. The data layer is fully operational; search features are unavailable.

---

## Known issues

### Search Index Management not available — setup exits cleanly but skips indexes

Running `npm run agent:setup` against a deployment without mongot produces:

```
WARN  service:setup | Search Index Management unavailable | reason=Executor error during aggregate command on namespace: rag.films :: caused by :: Error connecting to Search Index Management service.
WARN  service:setup | Search indexes skipped: Search Index Management not available on this deployment. Requires Atlas M10+ or Enterprise Advanced with mongot running. Set MONGODB_SEARCH=false to silence, or MONGODB_SEARCH=true to force attempts.
INFO  setup | Setup complete
```

The collection is created and schema validation is applied. Only vector and full-text search indexes are absent. This is expected when mongot is not running — set `MONGODB_SEARCH=false` to suppress the messages.

### `$vectorSearch` returns empty at query time

When the server is running against a deployment without mongot and a RAG query is issued, `retrieveRelevantChunks()` catches the aggregation failure and returns an empty array:

```
WARN  service:rag | Vector search failed | error=...
```

The LLM still receives the request and generates a response, but without retrieved context its answer will be generic. This is graceful degradation — the API does not return an error status.

### Atlas M0/M2 free tier

Free-tier Atlas clusters do not run mongot. The symptoms and resolution are identical to EA-without-mongot. Upgrading to M10+ or switching to a local `atlas deployments start` cluster restores full functionality.

---

## Where compatibility logic lives

Compatibility handling is intentionally contained within the service layer. No changes were made to controllers, routing, utilities, or the data layer:

| File | Responsibility |
|------|---------------|
| [`src/agent/services/SetupService.js`](../src/agent/services/SetupService.js) | Probe via `listSearchIndexes`; flag propagation; graceful skip of index creation |
| [`src/agent/services/RagService.js`](../src/agent/services/RagService.js) | Try/catch on `$vectorSearch`; existing try/catch on `$search` |
| [`src/agent/bin/setup.js`](../src/agent/bin/setup.js) | Reads `MONGODB_SEARCH` and passes `searchEnabled` to `SetupService` |

Deploying mongot on an existing EA installation requires no code changes — the probe detects the new capability on the next `agent:setup` run and creates all indexes normally.
