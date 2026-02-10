export class VoyageAIService {

    constructor({ apiUrl, apiKey, model, maxChunkChars }) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
        this.maxChunkChars = maxChunkChars ?? 800;
    }

    /**
     * Get embeddings for one or more texts (single request). Helps stay under rate limits.
     * @param {string | string[]} input - Single text or array of texts
     * @param {{ model?: string }} [options]
     * @returns {Promise<number[] | number[][]>} Single embedding or array of embeddings (same order as input)
     */
    async getEmbedding(input, options) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: Array.isArray(input) ? input : [input],
                model: options?.model || this.model,
            })
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`VoyageAI error: ${response.status} - ${body}`);
        }

        const result = await response.json();
        const embeddings = result.data.map((d) => d.embedding);
        return Array.isArray(input) ? embeddings : embeddings[0];
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