export class VoyageAIService {

    constructor({ apiUrl, apiKey, model }) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
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
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`VoyageAI error: ${response.status} - ${body}`);
        }

        const result = await response.json();
        const embeddings = result.data.map((d) => d.embedding);
        return Array.isArray(input) ? embeddings : embeddings[0];
    }
}