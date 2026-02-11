import { logger } from '../utils/logger.js';

const COMPONENT = 'rag';

export class RagService {

    constructor(options) {
        this.collection = options?.db.collection(options.collectionName);
        this.srvVoyage = options?.srvVoyage;
        this.srvLLM = options?.srvLLM;
        this.indexName = options?.vectorIndexName ?? 'rag_vector';
    }

    async retrieveRelevantChunks(options) {
        const { embedding, k = 5, path = 'embedding', type = 'text' } = options || {};
        const indexName = `${this.indexName}_${type}_index`;
        const indexPath = `${path}.${type}`;
        const pipeline = [
            {
                $vectorSearch: {
                    path: indexPath,
                    index: indexName,
                    queryVector: embedding,
                    numCandidates: 200,
                    limit: k,
                },
            },
            {
                $project: {
                    title: 1,
                    description: 1,
                    coverImage: 1,
                    score: { $meta: 'vectorSearchScore' },
                },
            },
        ];
        logger.info(COMPONENT, 'Running vector search', { indexName, indexPath, k, type, length: embedding?.length });
        const docs = await this.collection.aggregate(pipeline).toArray();
        return docs;
    }

    async ask(question, options) {
        const { k = 5, path = 'embedding', type = 'text' } = options || {};

        logger.info(COMPONENT, 'Embedding question');
        const embedding = await this.srvVoyage.getEmbedding(question);

        logger.info(COMPONENT, 'Vector search', { k, path, type, length: embedding?.length });
        const chunks = await this.retrieveRelevantChunks({ embedding, k, path, type });
        logger.info(COMPONENT, 'Chunks retrieved', { count: chunks.length });

        logger.info(COMPONENT, 'Calling LLM');
        const response = await this.srvLLM.invoke(question, chunks);

        logger.info(COMPONENT, 'LLM response received', { length: response?.content?.length });
        const answer = response.content;

        return {
            answer,
            contextChunks: chunks.map((c) => ({
                title: c.title,
                description: c.description,
                coverImage: c.coverImage,
                score: c.score,
            })),
        };
    }
}
