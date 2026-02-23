import { logger } from '../utils/logger.js';

const COMPONENT = 'service:jina-rerank';

/**
 * Jina AI multimodal reranker service. Wraps the Jina rerank REST API.
 * Supports text and image documents — images can be base64 data URLs or HTTP URLs.
 * @see https://jina.ai/reranker/
 */
export class JinaRerankService {

    /**
     * @param {{ apiUrl?: string, apiKey: string, model?: string }} options
     */
    constructor({ apiUrl, apiKey, model }) {
        this.apiUrl = apiUrl || 'https://api.jina.ai/v1/rerank';
        this.apiKey = apiKey;
        this.model = model || 'jina-reranker-m0';
    }

    /**
     * Rerank documents by relevance to the query using Jina's multimodal cross-encoder.
     * Documents can be text objects or image objects (base64 data URL / HTTP URL).
     *
     * @param {string} query - search query (text only — Jina API constraint)
     * @param {{ text: string }[] | { image: string }[]} documents - list of documents to rerank
     * @param {{ top_n?: number, model?: string }} [options]
     * @returns {Promise<{ index: number, relevance_score: number }[]>} results sorted by relevance desc
     */
    async rerank(query, documents, options = {}) {
        if (!query?.trim() || !Array.isArray(documents) || documents.length === 0) {
            return [];
        }
        const topN = options.top_n ?? documents.length;
        const model = options.model ?? this.model;
        const body = {
            query: query.trim(),
            documents,
            model,
            top_n: Math.min(topN, documents.length),
        };
        logger.info(COMPONENT, 'Rerank request', { queryLen: query.length, docCount: documents.length, top_n: body.top_n, model });

        const response = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            const text = await response.text();
            if (response.status === 429 && !(options?.retried)) {
                const waitMs = 65_000;
                logger.warn(COMPONENT, 'Rate limited (429), retrying after wait', { waitMs });
                await new Promise((r) => setTimeout(r, waitMs));
                return this.rerank(query, documents, { ...options, retried: true });
            }
            logger.error(COMPONENT, 'Rerank API error', { status: response.status, body: text.slice(0, 200) });
            return [];
        }

        const result = await response.json();
        const data = result.results ?? [];
        return data.map((r) => ({ index: r.index, relevance_score: r.relevance_score ?? 0 }));
    }
}
