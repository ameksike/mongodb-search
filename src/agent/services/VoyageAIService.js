export class VoyageAIService {

    constructor({ apiUrl, apiKey, model }) {
        this.apiUrl = apiUrl;
        this.apiKey = apiKey;
        this.model = model;
    }

    async getEmbedding(data, options) {
        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input: data,
                model: options?.model || this.model,
            }),
        });

        if (!response.ok) {
            const body = await response.text();
            throw new Error(`VoyageAI error: ${response.status} - ${body}`);
        }

        const data = await response.json();
        return data.data[0].embedding;
    }
}