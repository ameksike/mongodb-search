import { logger } from '../utils/logger.js';

const COMPONENT = 'service:voyage';

/**
 * Image MIME types supported by Voyage AI multimodal embedding API (image_base64).
 * Images can be in any of these formats for embeddings to work correctly.
 * @see https://docs.voyageai.com/docs/multimodal-embeddings
 */
export const SUPPORTED_IMAGE_MIME_TYPES = Object.freeze([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif',
]);

const MIME_ALIASES = Object.freeze({ 'image/jpg': 'image/jpeg' });

function normalizeImageMimeType(mimeType) {
    const normalized = (MIME_ALIASES[mimeType?.toLowerCase()] ?? mimeType?.toLowerCase()?.trim()) || 'image/jpeg';
    return SUPPORTED_IMAGE_MIME_TYPES.includes(normalized) ? normalized : 'image/jpeg';
}

export class VoyageAIService {

    constructor({ apiUrl, apiKey, model, maxChunkChars, multimodalModel, rerankModel, rerankPath = '/rerank' }) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.maxChunkChars = maxChunkChars ?? 800;
        this.multimodalModel = multimodalModel ?? 'voyage-multimodal-3';
        this.rerankModel = rerankModel ?? process.env.VOYAGE_RERANK_MODEL ?? 'rerank-2.5-lite';
        const baseUrl = (apiUrl || '').replace(/\/embeddings\/?$/, '').replace(/\/$/, '');
        this.multimodalUrl = baseUrl + '/multimodalembeddings';
        this.rerankUrl = baseUrl + rerankPath;
    }

    /**
     * Get embeddings for one or more texts (single request). Helps stay under rate limits.
     * @param {string | string[]} input - Single text or array of texts
     * @param {{ model?: string }} [options]
     * @returns {Promise<number[] | number[][]>} Single embedding or array of embeddings (same order as input)
     */
    async getEmbedding(input, options) {
        const inputs = Array.isArray(input) ? input : [input];
        logger.info(COMPONENT, 'Embedding request', { inputCount: inputs.length, model: options?.model || this.model });
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: inputs,
                model: options?.model || this.model,
            })
        });

        if (!response.ok) {
            const body = await response.text();
            if (response.status === 429 && !(options?.retried)) {
                const waitMs = 65_000;
                logger.warn(COMPONENT, 'Rate limited (429), retrying after wait', { waitMs });
                await new Promise((r) => setTimeout(r, waitMs));
                return this.getEmbedding(input, { ...options, retried: true });
            }
            logger.error(COMPONENT, 'API error', { status: response.status, body: body.slice(0, 200) });
            throw new Error(`VoyageAI error: ${response.status} - ${body}`);
        }

        const result = await response.json();
        const embeddings = result.data.map((d) => d.embedding);
        return Array.isArray(input) ? embeddings : embeddings[0];
    }

    /**
     * Get embedding for a single image (buffer). Uses Voyage multimodal API with image_base64.
     * Supported image formats: image/jpeg, image/png, image/webp, image/gif. Other MIME types
     * are normalized (e.g. image/jpg → image/jpeg) or defaulted to image/jpeg.
     * @param {Buffer} imageBuffer - Raw image bytes (any supported format)
     * @param {string} [mimeType] - MIME type: "image/jpeg" | "image/png" | "image/webp" | "image/gif" (alias image/jpg allowed)
     * @param {{ model?: string }} [options]
     * @returns {Promise<number[] | null>} Embedding vector or null on failure
     */
    async getImageEmbedding(imageBuffer, mimeType = 'image/jpeg', options = {}) {
        if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) return null;
        const normalizedMime = normalizeImageMimeType(mimeType);
        if (normalizedMime !== mimeType?.toLowerCase?.()) {
            logger.info(COMPONENT, 'Image MIME normalized', { from: mimeType, to: normalizedMime });
        }
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${normalizedMime};base64,${base64}`;
        const model = options.model ?? this.multimodalModel;
        logger.info(COMPONENT, 'Image embedding request', { size: imageBuffer.length, model });
        try {
            const response = await fetch(this.multimodalUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    inputs: [{ content: [{ type: 'image_base64', image_base64: dataUrl }] }],
                    model,
                    input_type: 'document',
                }),
            });
            if (!response.ok) {
                const body = await response.text();
                if (response.status === 429 && !(options?.retried)) {
                    const waitMs = 65_000;
                    logger.warn(COMPONENT, 'Rate limited (429), retrying after wait', { waitMs });
                    await new Promise((r) => setTimeout(r, waitMs));
                    return this.getImageEmbedding(imageBuffer, mimeType, { ...options, retried: true });
                }
                logger.error(COMPONENT, 'Multimodal API error', { status: response.status, body: body.slice(0, 200) });
                return null;
            }
            const result = await response.json();
            const embedding = result.data?.[0]?.embedding;
            return Array.isArray(embedding) ? embedding : null;
        } catch (err) {
            logger.error(COMPONENT, 'Image embedding failed', { error: err.message });
            return null;
        }
    }

    /**
     * Rerank documents by relevance to the query. Uses Voyage rerank API (cross-encoder).
     * @param {string} query - search query
     * @param {string[]} documents - list of document strings to rerank (max 1000)
     * @param {{ top_k?: number, model?: string }} [options]
     * @returns {Promise<{ index: number, relevance_score: number }[]>} results sorted by relevance (desc)
     */
    async rerank(query, documents, options = {}) {
        if (!query?.trim() || !Array.isArray(documents) || documents.length === 0) {
            return [];
        }
        const topK = options.top_k ?? documents.length;
        const model = options.model ?? this.rerankModel;
        const body = { query: query.trim(), documents, model, top_k: Math.min(topK, documents.length) };
        logger.info(COMPONENT, 'Rerank request', { queryLen: query.length, docCount: documents.length, top_k: body.top_k, model });
        const response = await fetch(this.rerankUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const text = await response.text();
            logger.error(COMPONENT, 'Rerank API error', { status: response.status, body: text.slice(0, 200) });
            return [];
        }
        const result = await response.json();
        const data = result.data ?? [];
        return data.map((r) => ({ index: r.index, relevance_score: r.relevance_score ?? 0 }));
    }

    /**
     * Simple text chunking by character count. Adjust as needed for better semantic chunks.
     * @param {string} text
     * @returns {string[]}
     */
    chunkText(text) {
        const chunks = [];
        let offset = 0;
        while (offset < text.length) {
            chunks.push(text.slice(offset, offset + this.maxChunkChars));
            offset += this.maxChunkChars;
        }
        return chunks;
    }

    /**
     * Naive chunking: splits text into fixed-size chunks and gets embeddings for each chunk.
     * @param {{ sourceId: string, title: string, url: string, text: string }} doc
     */
    async getNaiveChunking(doc) {
        const { sourceId, title, url, text } = doc;
        const rawChunks = this.chunkText(text);
        const docsToInsert = [];

        for (let i = 0; i < rawChunks.length; i++) {
            const chunkContent = rawChunks[i];
            const embedding = await this.getEmbedding(chunkContent);
            docsToInsert.push({
                sourceId,
                chunkId: i,
                content: chunkContent,
                metadata: { title, url },
                embedding,
            });
        }

        return docsToInsert;
    }
}