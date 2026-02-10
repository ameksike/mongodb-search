import { logger } from '../utils/logger.js';

const COMPONENT = 'setup';

/**
 * Service responsible for ensuring the RAG collection and vector search index exist.
 * Used by bin/setup.js. Options are injected so the service stays testable and env-agnostic.
 */
export class SetupService {

    /**
     * @param {import('mongodb').Db} db
     * @param {{
     *   collectionName: string;
     *   vectorIndexName?: string;
     *   dimensions: number;
     *   similarity?: string;
     *   enableValidation?: boolean;
     * }} options
     */
    constructor(db, options) {
        this.db = db;
        this.collectionName = options.collectionName;
        this.vectorIndexName = options.vectorIndexName ?? 'rag_vector_index';
        this.dimensions = options.dimensions;
        this.similarity = options.similarity ?? 'cosine';
        this.enableValidation = options.enableValidation ?? false;
    }

    /**
     * Ensure the collection exists; optionally create or update schema validator.
     */
    async ensureCollection() {
        const existsCursor = this.db.listCollections({ name: this.collectionName });
        const exists = await existsCursor.hasNext();

        if (!exists) {
            const opts = this.enableValidation
                ? {
                    validator: {
                        $jsonSchema: {
                            bsonType: 'object',
                            required: ['embedding'],
                            properties: {
                                embedding: {
                                    bsonType: 'array',
                                    minItems: this.dimensions,
                                    maxItems: this.dimensions,
                                    items: { bsonType: 'double' },
                                },
                            },
                        },
                    },
                }
                : {};
            await this.db.createCollection(this.collectionName, opts);
            logger.info(COMPONENT, 'Collection created', { collection: this.collectionName, withValidator: this.enableValidation });
            return;
        }

        if (this.enableValidation) {
            await this.db.command({
                collMod: this.collectionName,
                validator: {
                    $jsonSchema: {
                        bsonType: 'object',
                        required: ['embedding'],
                        properties: {
                            embedding: {
                                bsonType: 'array',
                                minItems: this.dimensions,
                                maxItems: this.dimensions,
                                items: { bsonType: 'double' },
                            },
                        },
                    },
                },
            });
            logger.info(COMPONENT, 'Validator updated', { collection: this.collectionName });
        } else {
            logger.info(COMPONENT, 'Collection already exists', { collection: this.collectionName });
        }
    }

    /**
     * Ensure the vector search index exists on the collection.
     */
    async ensureVectorSearchIndex() {
        const collection = this.db.collection(this.collectionName);
        const existing = [];
        try {
            const cursor = collection.listSearchIndexes();
            for await (const idx of cursor) existing.push(idx);
        } catch (err) {
            logger.warn(COMPONENT, 'Could not list search indexes', { reason: err.message });
            return;
        }

        if (existing.some((idx) => idx.name === this.vectorIndexName)) {
            logger.info(COMPONENT, 'Vector Search index already exists', { index: this.vectorIndexName });
            return;
        }

        // Atlas Vector Search requires definition.fields (array) with path and numDimensions
        await collection.createSearchIndex({
            name: this.vectorIndexName,
            type: 'vectorSearch',
            definition: {
                fields: [
                    {
                        type: 'vector',
                        path: 'embedding',
                        numDimensions: this.dimensions,
                        similarity: this.similarity,
                    },
                ],
            },
        });
        logger.info(COMPONENT, 'Vector Search index created', { index: this.vectorIndexName, dimensions: this.dimensions, similarity: this.similarity });
    }

    /**
     * Run full setup: collection then vector index.
     */
    async run() {
        await this.ensureCollection();
        await this.ensureVectorSearchIndex();
    }
}
