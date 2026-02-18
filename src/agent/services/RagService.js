import { logger } from '../utils/logger.js';

const COMPONENT = 'service:rag';

/** Default RRF constant (Reciprocal Rank Fusion). */
const RRF_K = 60;

export class RagService {

    /**
     * @param {{ 
     *      db: import('mongodb').Db, - MongoDB database instance
     *      collectionName: string, - name of the collection with docs and embeddings
     *      srvVoyage: import('../services/VoyageAIService.js').VoyageAIService, - for embeddings
     *      srvLLM: any, - for LLM calls; must have .invoke(question, chunks) method. Can be OllamaService or similar.
     *      vectorIndexName?: string, - prefix for vector search indexes (default: 'rag_vector', resulting in 'rag_vector_text_index' and 'rag_vector_image_index')
     *      searchIndexName?: string - Atlas Search index name for full-text search (optional; if not provided, askHybrid will fall back to vector-only)
     * }} options - searchIndexName: Atlas Search index for full-text (hybrid); optional
     */
    constructor(options) {
        this.collection = options?.db.collection(options.collectionName);
        this.srvVoyage = options?.srvVoyage;
        this.srvLLM = options?.srvLLM;
        this.indexName = options?.vectorIndexName ?? 'rag_vector';
        this.searchIndexName = options?.searchIndexName ?? null;
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
        const chunks = await this.retrieveRelevantChunks({ embedding, k, type: 'text' });
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
        const chunks = await this.retrieveRelevantChunks({ embedding, k, type: 'image' });
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
        const chunks = fullTextDocs.length
            ? this.mergeWithRRF(vectorDocs, fullTextDocs).slice(0, k)
            : vectorDocs;
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
