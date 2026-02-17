import { logger } from '../utils/logger.js';

const COMPONENT = 'service:voyage';

export class VoyageAIService {

    constructor({ apiUrl, apiKey, model, maxChunkChars, multimodalModel }) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.maxChunkChars = maxChunkChars ?? 800;
        this.multimodalModel = multimodalModel ?? 'voyage-multimodal-3';
        this.multimodalUrl = (apiUrl || '').replace(/\/embeddings\/?$/, '') + '/multimodalembeddings';
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
            logger.error(COMPONENT, 'API error', { status: response.status, body: body.slice(0, 200) });
            throw new Error(`VoyageAI error: ${response.status} - ${body}`);
        }

        const result = await response.json();
        const embeddings = result.data.map((d) => d.embedding);
        return Array.isArray(input) ? embeddings : embeddings[0];
    }

    /**
     * Get embedding for a single image (buffer). Uses Voyage multimodal API with image_base64.
     * @param {Buffer} imageBuffer - Raw image bytes
     * @param {string} [mimeType] - e.g. "image/jpeg", "image/png"
     * @param {{ model?: string }} [options]
     * @returns {Promise<number[] | null>} Embedding vector or null on failure
     */
    async getImageEmbedding(imageBuffer, mimeType = 'image/jpeg', options = {}) {
        if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) return null;
        const base64 = imageBuffer.toString('base64');
        const dataUrl = `data:${mimeType};base64,${base64}`;
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