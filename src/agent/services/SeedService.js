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
     * @param {{ title: string, url: string, text: string, coverImage: string, year?: number, genre?: string, imageEmbedding?: number[] }[]} documents - imageEmbedding optional; if missing, text embedding is used for embedding.image
     */
    async run(documents) {
        try {
            if (documents.length === 0) {
                logger.info(COMPONENT, 'No documents to ingest');
                return;
            }
            logger.info(COMPONENT, 'Embedding documents', { count: documents.length });

            const [textEmbeddings, imageEmbeddings] = await Promise.all([
                this.srvVoyage.getEmbedding(documents.map((d) => d.text)),
                null
            ]);

            logger.info(COMPONENT, 'Text Embeddings received', { count: textEmbeddings?.length ?? 0 });
            logger.info(COMPONENT, 'Image Embeddings received', { count: imageEmbeddings?.length ?? 0 });

            const docsToInsert = documents.map((doc, i) => {
                const base = {
                    title: doc.title,
                    description: doc.text,
                    coverImage: doc.coverImage ?? doc.url,
                    embedding: {
                        text: (textEmbeddings && textEmbeddings[i]) || [],
                        image: (imageEmbeddings && imageEmbeddings[i]) || []
                    },
                };
                if (doc.year !== undefined) base.year = doc.year;
                if (doc.genre !== undefined) base.genre = doc.genre;
                return base;
            });

            const res = await this.collection.insertMany(docsToInsert);
            logger.info(COMPONENT, 'Ingest complete', { documents: documents.length, insertedIds: Object.values(res.insertedIds) });
        }
        catch (err) {
            logger.error(COMPONENT, 'Ingest failed', { error: err.message }); throw err;
        }
    }
}
