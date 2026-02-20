import { logger } from '../utils/logger.js';

const COMPONENT = 'service:rag';

/** Default RRF constant (Reciprocal Rank Fusion). */
const RRF_K = 60;

export class RagService {

    /**
     * @param {{ 
     *      db: import('mongodb').Db,
     *      collectionName: string,
     *      srvVoyage: import('../services/VoyageAIService.js').VoyageAIService,
     *      srvLLM: any,
     *      vectorIndexName?: string,
     *      searchIndexName?: string,
     *      useRerank?: boolean - if true, rerank retrieved chunks with Voyage reranker before LLM (default from RAG_RERANK_ON env)
     * }} options
     */
    constructor(options) {
        this.collection = options?.db.collection(options.collectionName);
        this.srvVoyage = options?.srvVoyage;
        this.srvLLM = options?.srvLLM;
        this.indexName = options?.vectorIndexName ?? 'rag_vector';
        this.searchIndexName = options?.searchIndexName ?? null;
        const envRerank = process.env.RAG_RERANK_ON;
        this.useRerank = options?.useRerank ?? (envRerank === 'true' || envRerank === '1');
    }

    /**
     * Vector search: retrieve docs by embedding. Uses $vectorSearch.
     * @param {{ embedding: number[], k?: number, path?: string, type?: 'text'|'image' }} options
     * @returns {Promise<{ _id: any, title: string, description: string, coverImage: string, score: number }[]>}
     */
    async retrieveRelevantChunks(options) {
        const { embedding, k = 5, path = 'embedding', type = 'text' } = options || {};
        const indexName = `${this.indexName}_${type}_index`;
        const indexPath = `${path}.${type}`;
        const pipeline = [
            {
                $vectorSearch: {
                    path: indexPath,
                    index: indexName,
                    queryVector: embedding,
                    numCandidates: Math.min(200, (k || 5) * 20),
                    limit: k,
                },
            },
            {
                $project: {
                    title: 1,
                    description: 1,
                    coverImage: 1,
                    score: { $meta: 'vectorSearchScore' },
                },
            },
        ];
        logger.info(COMPONENT, 'Vector search', { indexName, k, type });
        const docs = await this.collection.aggregate(pipeline).toArray();
        return docs;
    }

    /**
     * Full-text search via Atlas Search $search. Returns [] if no index or on error.
     * @param {string} question - query text
     * @param {{ k?: number }} options
     * @returns {Promise<{ _id: any, title: string, description: string, coverImage: string, score: number }[]>}
     */
    async retrieveByFullText(question, options = {}) {
        const k = options.k ?? 5;
        if (!this.searchIndexName || !question?.trim()) return [];

        try {
            const pipeline = [
                {
                    $search: {
                        index: this.searchIndexName,
                        text: {
                            query: question,
                            path: ['title', 'description'],
                        },
                    },
                },
                { $limit: k },
                {
                    $project: {
                        title: 1,
                        description: 1,
                        coverImage: 1,
                        score: { $meta: 'searchScore' },
                    },
                },
            ];
            const docs = await this.collection.aggregate(pipeline).toArray();
            logger.info(COMPONENT, 'Full-text search', { index: this.searchIndexName, count: docs.length });
            return docs;
        } catch (err) {
            logger.warn(COMPONENT, 'Full-text search skipped', { error: err.message });
            return [];
        }
    }

    /**
     * Optionally rerank chunks by query with Voyage reranker. Returns chunks in same shape with updated scores and order.
     * @param {string} query
     * @param {{ _id: any, title: string, description: string, coverImage: string, score: number }[]} chunks
     * @param {number} k - top_k for reranker
     * @returns {Promise<{ _id: any, title: string, description: string, coverImage: string, score: number }[]>}
     */
    async applyRerank(query, chunks, k) {
        if (!this.useRerank || chunks.length === 0 || typeof this.srvVoyage?.rerank !== 'function') {
            return chunks;
        }
        const documents = chunks.map((c) => [c.title, c.description].filter(Boolean).join(' ').trim() || ' ');
        const results = await this.srvVoyage.rerank(query, documents, { top_k: Math.min(k, chunks.length) });
        if (results.length === 0) return chunks;
        return results.map((r) => ({ ...chunks[r.index], score: r.relevance_score }));
    }

    /**
     * Merge two result lists with Reciprocal Rank Fusion. Dedupes by _id, sorts by RRF score.
     * @param {{ _id: any }[]} listA
     * @param {{ _id: any }[]} listB
     * @param {number} k - RRF constant
     * @returns {{ _id: any, title: string, description: string, coverImage: string, score: number }[]}
     */
    mergeWithRRF(listA, listB, k = RRF_K) {
        const scores = new Map();
        const byId = new Map();

        const add = (doc, rank) => {
            const id = doc._id?.toString();
            if (!id) return;
            const rrf = 1 / (k + rank + 1);
            scores.set(id, (scores.get(id) ?? 0) + rrf);
            if (!byId.has(id)) byId.set(id, { ...doc, score: 0 });
            byId.get(id).score = scores.get(id);
        };

        listA.forEach((doc, i) => add(doc, i));
        listB.forEach((doc, i) => add(doc, i));

        return Array.from(byId.values()).sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    }

    /**
     * Build response shape and call LLM. Shared by text, image, hybrid.
     * @param {string} question
     * @param {{ _id: any, title: string, description: string, coverImage: string, score: number }[]} chunks
     * @returns {Promise<{ answer: string, contextChunks: { title: string, description: string, coverImage: string, score: number }[] }>}
     */
    async answerWithChunks(question, chunks) {
        const response = await this.srvLLM.invoke(question, chunks);
        return {
            answer: response?.content ?? '',
            contextChunks: chunks.map((c) => ({
                title: c.title,
                description: c.description,
                coverImage: c.coverImage,
                score: c.score,
            })),
        };
    }

    /**
     * RAG via text only: embed question → vector search (text index) → LLM.
     * @param {string} question
     * @param {{ k?: number }} options
     */
    async askText(question, options = {}) {
        const k = options.k ?? 5;
        const embedding = await this.srvVoyage.getEmbedding(question);
        let chunks = await this.retrieveRelevantChunks({ embedding, k, type: 'text' });
        chunks = await this.applyRerank(question, chunks, k);
        return this.answerWithChunks(question, chunks);
    }

    /**
     * RAG via image only: image embedding → vector search (image index) → LLM.
     * @param {Buffer} imageBuffer - raw image bytes
     * @param {string} mimeType - e.g. image/jpeg
     * @param {{ question?: string, k?: number }} options - question: optional prompt (default: about relevant films)
     */
    async askImage(imageBuffer, mimeType, options = {}) {
        const k = options.k ?? 5;
        const question = options.question ?? 'What films are relevant to this image?';
        const embedding = await this.srvVoyage.getImageEmbedding(imageBuffer, mimeType);
        if (!embedding?.length) {
            return { answer: 'Could not generate an embedding from the image.', contextChunks: [] };
        }
        let chunks = await this.retrieveRelevantChunks({ embedding, k, type: 'image' });
        chunks = await this.applyRerank(question, chunks, k);
        return this.answerWithChunks(question, chunks);
    }

    /**
     * RAG hybrid: text embedding + full-text search, merge with RRF, then LLM. Falls back to vector-only if no search index.
     * @param {string} question
     * @param {{ k?: number }} options
     */
    async askHybrid(question, options = {}) {
        const k = options.k ?? 5;
        const [embedding, fullTextDocs] = await Promise.all([
            this.srvVoyage.getEmbedding(question),
            this.retrieveByFullText(question, { k }),
        ]);
        const vectorDocs = await this.retrieveRelevantChunks({ embedding, k, type: 'text' });
        let chunks = fullTextDocs.length
            ? this.mergeWithRRF(vectorDocs, fullTextDocs).slice(0, k)
            : vectorDocs;
        chunks = await this.applyRerank(question, chunks, k);
        return this.answerWithChunks(question, chunks);
    }

    /**
     * Legacy: same as askText.
     * @param {string} question
     * @param {{ k?: number }} options
     */
    async ask(question, options = {}) {
        return this.askText(question, options);
    }
}
