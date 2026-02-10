/**
 * Service responsible for seeding the RAG collection: embed full document text via VoyageAI, insert into MongoDB.
 * One embedding per document (full text); one batch API call for all documents, one insertMany. No chunking.
 */
export class SeedService {

    /**
     * @param {import('mongodb').Collection} collection
     * @param {InstanceType<import('./VoyageAIService.js').VoyageAIService>} srvVoyage
     */
    constructor(collection, srvVoyage) {
        this.collection = collection;
        this.srvVoyage = srvVoyage;
    }

    /**
     * Ingest all documents in one batch: one getEmbedding(list of texts), one insertMany.
     * @param {{ sourceId: string, title: string, url: string, text: string }[]} documents
     */
    async run(documents) {
        if (documents.length === 0) {
            console.log('Seed complete: 0 documents.');
            return;
        }

        const texts = documents.map((d) => d.text);
        const embeddings = await this.srvVoyage.getEmbedding(texts);

        const docsToInsert = documents.map((doc, i) => ({
            sourceId: doc.sourceId,
            content: doc.text,
            metadata: { title: doc.title, url: doc.url },
            embedding: embeddings[i],
        }));

        await this.collection.insertMany(docsToInsert);
        console.log(`Seed complete: ${documents.length} documents ingested (1 API call).`);
    }
}
