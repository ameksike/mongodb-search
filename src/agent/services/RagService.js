import { logger } from '../utils/logger.js';

const COMPONENT = 'rag';

export class RagService {

    constructor(options) {
        this.collection = options?.db.collection(options.collectionName);
        this.srvVoyage = options?.srvVoyage;
        this.srvLLM = options?.srvLLM;
    }

    async retrieveRelevantChunks(embedding, k = 5) {
        const pipeline = [
            {
                $vectorSearch: {
                    index: 'rag_vector_index',
                    path: 'embedding',
                    queryVector: embedding,
                    numCandidates: 200,
                    limit: k,
                },
            },
            {
                $project: {
                    content: 1,
                    metadata: 1,
                    score: { $meta: 'vectorSearchScore' },
                },
            },
        ];

        const docs = await this.collection.aggregate(pipeline).toArray();
        return docs;
    }

    async ask(question) {
        logger.info(COMPONENT, 'Embedding question');
        const embedding = await this.srvVoyage.getEmbedding(question);

        logger.info(COMPONENT, 'Vector search', { k: 5 });
        const chunks = await this.retrieveRelevantChunks(embedding, 5);
        logger.info(COMPONENT, 'Chunks retrieved', { count: chunks.length });

        logger.info(COMPONENT, 'Calling LLM');
        const response = await this.srvLLM.invoke(question, chunks);

        const answer = response.content;

        return {
            answer,
            contextChunks: chunks.map((c) => ({
                content: c.content,
                metadata: c.metadata,
                score: c.score,
            })),
        };
    }
}
