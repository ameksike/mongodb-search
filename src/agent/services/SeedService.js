/**
 * Service responsible for seeding the RAG collection: chunk text, embed via VoyageAI, insert into MongoDB.
 * Reuses embedding logic only; no LLM. Used by ingest.js.
 */
export class SeedService {

    /**
     * @param {import('mongodb').Collection} collection
     * @param {InstanceType<import('./VoyageAIService.js').VoyageAIService>} srvVoyage
     * @param {{ maxChunkChars?: number }} [options]
     */
    constructor(collection, srvVoyage, options = {}) {
        this.collection = collection;
        this.srvVoyage = srvVoyage;
        this.maxChunkChars = options.maxChunkChars ?? 800;
    }

    /**
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
     * Ingest one document: chunk, embed, insert.
     * @param {{ sourceId: string, title: string, url: string, text: string }} doc
     */
    async ingestDocument(doc) {
        const { sourceId, title, url, text } = doc;
        const rawChunks = this.chunkText(text);
        const docsToInsert = [];

        for (let i = 0; i < rawChunks.length; i++) {
            const chunkContent = rawChunks[i];
            const embedding = await this.srvVoyage.getEmbedding(chunkContent);
            docsToInsert.push({
                sourceId,
                chunkId: i,
                content: chunkContent,
                metadata: { title, url },
                embedding,
            });
        }

        if (docsToInsert.length > 0) {
            await this.collection.insertMany(docsToInsert);
            console.log(`Ingested ${docsToInsert.length} chunks for sourceId=${sourceId}`);
        }
    }

    /**
     * Ingest all documents in order.
     * @param {{ sourceId: string, title: string, url: string, text: string }[]} documents
     */
    async run(documents) {
        for (const doc of documents) {
            await this.ingestDocument(doc);
        }
        console.log(`Seed complete: ${documents.length} documents ingested.`);
    }
}
