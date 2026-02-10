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
        // 1) Embed question with VoyageAI
        const embedding = await this.srvVoyage.getEmbedding(question);

        // 2) Vector search on MongoDB
        const chunks = await this.retrieveRelevantChunks(embedding, 5);

        // 3) Call Ollama LLM via LangChain ChatOllama
        const response = await this.srvLLM.invoke(question, chunks);

        // 4) Return answer + source chunks
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
