import { logger } from '../utils/logger.js';

const COMPONENT = 'seed';

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
     * @param {{ title: string, url: string, text: string, coverImage: string, imageEmbedding?: number[] }[]} documents - imageEmbedding optional; if missing, text embedding is used for embedding.image
     */
    async run(documents) {
        if (documents.length === 0) {
            logger.info(COMPONENT, 'No documents to ingest');
            return;
        }
        logger.info(COMPONENT, 'Embedding documents', { count: documents.length });
        const texts = documents.map((d) => d.text);
        const [textEmbeddings, imageEmbeddings] = await Promise.all([
            this.srvVoyage.getEmbedding(texts),
            null
        ]);
        
        logger.info(COMPONENT, 'Text Embeddings received', { count: textEmbeddings?.length ?? 0 });
        logger.info(COMPONENT, 'Image Embeddings received', { count: imageEmbeddings?.length ?? 0 });

        const docsToInsert = documents.map((doc, i) => {
            return {
                title: doc.title,
                description: doc.text,
                coverImage: doc.coverImage ?? doc.url,
                embedding: {
                    text: textEmbeddings ? textEmbeddings[i] : undefined,
                    image: imageEmbeddings ? imageEmbeddings[i] : undefined
                },
            };
        });

        await this.collection.insertMany(docsToInsert);
        logger.info(COMPONENT, 'Ingest complete', { documents: documents.length, apiCalls: 1 });
    }
}
