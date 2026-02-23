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
     *      useRerank?: boolean,
     *      srvJinaRerank?: import('../services/JinaRerankService.js').JinaRerankService,
     *      srvStore?: import('../services/StoreService.js').StoreService,
     *      useRerankImage?: boolean,
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
        this.srvJinaRerank = options?.srvJinaRerank ?? null;
        this.srvStore = options?.srvStore ?? null;
        const envRerankImage = process.env.RAG_RERANK_IMAGE_ON;
        this.useRerankImage = options?.useRerankImage ?? (envRerankImage === 'true' || envRerankImage === '1');
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
     * Rerank chunks using the appropriate strategy per query type.
     * - text/hybrid: Voyage text cross-encoder.
     * - image + Jina configured + useRerankImage: Jina multimodal reranker (sends cover images).
     * - image fallback: Voyage if user provided a question, otherwise skip.
     * @param {string} query
     * @param {{ _id: any, title: string, description: string, coverImage: string, score: number }[]} chunks
     * @param {number} k - top_k / top_n for reranker
     * @param {{ queryType?: 'text'|'image'|'hybrid', hasUserQuestion?: boolean }} [options]
     * @returns {Promise<{ _id: any, title: string, description: string, coverImage: string, score: number }[]>}
     */
    async applyRerank(query, chunks, k, options = {}) {
        const { queryType = 'text', hasUserQuestion = false } = options;
        if (chunks.length === 0) return chunks;

        // Image query: try Jina multimodal rerank ---
        if (queryType === 'image') {
            if (this.useRerankImage && typeof this.srvJinaRerank?.rerank === 'function') {
                return this.rerankImageWithJina(query, chunks, k);
            }
            // Fallback: Voyage text rerank only when user provided an explicit question
            if (hasUserQuestion && this.useRerank && typeof this.srvVoyage?.rerank === 'function') {
                logger.info(COMPONENT, 'Image rerank fallback to Voyage (user question provided)');
                return this.rerankTextWithVoyage(query, chunks, k);
            }
            logger.info(COMPONENT, 'Rerank skipped for image query', { jina: !!this.srvJinaRerank, useRerankImage: this.useRerankImage, hasUserQuestion });
            return chunks;
        }

        // Text / Hybrid: Voyage text rerank ---
        if (!this.useRerank || typeof this.srvVoyage?.rerank !== 'function') return chunks;
        return this.rerankTextWithVoyage(query, chunks, k);
    }

    /**
     * Voyage text cross-encoder rerank (title + description).
     * @private
     */
    async rerankTextWithVoyage(query, chunks, k) {
        const documents = chunks.map((c) => [c.title, c.description].filter(Boolean).join(' ').trim() || ' ');
        const results = await this.srvVoyage.rerank(query, documents, { top_k: Math.min(k, chunks.length) });
        if (results.length === 0) return chunks;
        return results.map((r) => ({ ...chunks[r.index], score: r.relevance_score }));
    }

    /**
     * Jina multimodal rerank: fetches cover images from store and sends them as base64 documents.
     * Falls back to text per-document when an image cannot be fetched.
     * @private
     */
    async rerankImageWithJina(query, chunks, k) {
        const documents = await Promise.all(
            chunks.map(async (c) => {
                if (c.coverImage && this.srvStore) {
                    try {
                        const buffer = await this.srvStore.readFromUrl(c.coverImage);
                        if (buffer?.length) {
                            const mime = this.mimeFromUrl(c.coverImage);
                            return { image: `data:${mime};base64,${buffer.toString('base64')}` };
                        }
                    } catch (err) {
                        logger.warn(COMPONENT, 'Image fetch failed, falling back to text', { coverImage: c.coverImage, error: err.message });
                    }
                }
                return { text: [c.title, c.description].filter(Boolean).join(' ').trim() || ' ' };
            }),
        );

        const imageCount = documents.filter((d) => d.image).length;
        logger.info(COMPONENT, 'Jina multimodal rerank', { docCount: documents.length, imageCount, textFallback: documents.length - imageCount });

        const results = await this.srvJinaRerank.rerank(query, documents, { top_n: Math.min(k, chunks.length) });
        if (results.length === 0) return chunks;
        return results.map((r) => ({ ...chunks[r.index], score: r.relevance_score }));
    }

    /**
     * Derive MIME type from a URL/path by extension. Defaults to image/jpeg.
     * @private
     */
    mimeFromUrl(url) {
        const ext = (url || '').split('.').pop()?.toLowerCase();
        const map = { png: 'image/png', webp: 'image/webp', gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg' };
        return map[ext] ?? 'image/jpeg';
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
        chunks = await this.applyRerank(question, chunks, k, { queryType: 'text' });
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
        const hasUserQuestion = Boolean(options.question?.trim());
        const question = options.question ?? 'What films are relevant to this image?';
        const embedding = await this.srvVoyage.getImageEmbedding(imageBuffer, mimeType);
        if (!embedding?.length) {
            return { answer: 'Could not generate an embedding from the image.', contextChunks: [] };
        }
        let chunks = await this.retrieveRelevantChunks({ embedding, k, type: 'image' });
        chunks = await this.applyRerank(question, chunks, k, { queryType: 'image', hasUserQuestion });
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
        chunks = await this.applyRerank(question, chunks, k, { queryType: 'text' });
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
