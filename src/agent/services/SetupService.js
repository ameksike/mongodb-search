import { logger } from '../utils/logger.js';

const COMPONENT = 'service:setup';

/**
 * Service responsible for ensuring the RAG collection and vector search index exist.
 * Document shape: { title, description, coverImage, embedding: { text: number[], image: number[] } }.
 * Indexes both embedding.text and embedding.image for text and image vector search.
 */
export class SetupService {

    /**
     * @param {import('mongodb').Db} db
     * @param {{
     *   collectionName: string;
     *   vectorIndexName?: string;
     *   dimensions?: number;
     *   dimensionsText?: number;
     *   dimensionsImage?: number;
     *   similarity?: string;
     *   enableValidation?: boolean;
     *   indexType?: 'isolated' | 'composed';
     * }} options - Use dimensions for both, or dimensionsText/dimensionsImage for separate sizes.
     */
    constructor(db, options) {
        this.db = db;
        this.collectionName = options.collectionName;
        this.vectorIndexName = options.vectorIndexName ?? 'rag_vector';
        this.dimensionsText = options.dimensionsText ?? options.dimensions ?? 1024;
        this.dimensionsImage = options.dimensionsImage ?? options.dimensions ?? 1024;
        this.similarity = options.similarity ?? 'cosine';
        this.enableValidation = options.enableValidation ?? false;
        this.indexType = options.indexType ?? 'both';
    }

    /**
     * Schema: document with title, description, coverImage, and embedding { text, image } vectors.
     */
    schemaValidator() {
        return {
            bsonType: 'object',
            required: ['title', 'description'],
            properties: {
                title: { bsonType: 'string' },
                description: { bsonType: 'string' },
                coverImage: { bsonType: 'string' },
                embedding: {
                    bsonType: 'object',
                    // required: ['text', 'image'],
                    properties: {
                        text: {
                            bsonType: 'array',
                            minItems: 0,
                            maxItems: this.dimensionsText,
                            items: { bsonType: 'double' },
                        },
                        image: {
                            bsonType: 'array',
                            minItems: 0,
                            maxItems: this.dimensionsImage,
                            items: { bsonType: 'double' },
                        },
                    },
                },
            },
        };
    }

    /**
     * Ensure the collection exists; optionally create or update schema validator.
     */
    async ensureCollection() {
        const existsCursor = this.db.listCollections({ name: this.collectionName });
        const exists = await existsCursor.hasNext();

        if (!exists) {
            const opts = this.enableValidation
                ? { validator: { $jsonSchema: this.schemaValidator() } }
                : {};
            await this.db.createCollection(this.collectionName, opts);
            logger.info(COMPONENT, 'Collection created', { collection: this.collectionName, withValidator: this.enableValidation });
            return;
        }

        if (this.enableValidation) {
            await this.db.command({
                collMod: this.collectionName,
                validator: { $jsonSchema: this.schemaValidator() },
            });
            logger.info(COMPONENT, 'Validator updated', { collection: this.collectionName });
        } else {
            logger.info(COMPONENT, 'Collection already exists', { collection: this.collectionName });
        }
    }

    /**
     * Ensure the vector search index exists: one index with two vector fields (embedding.text, embedding.image).
     */
    async ensureVectorSearchIndex() {
        const collection = this.db.collection(this.collectionName);
        const existingIndexes = await this.listSearchIndexes(collection);

        await this.cleanSearchIndexes(collection);

        if (this.indexType === 'composed') {
            await this.createComposedIndex(collection, existingIndexes);
        }
        if (this.indexType === 'text' || this.indexType === 'both') {
            await this.createTextIndex(collection, existingIndexes);
        }
        if (this.indexType === 'image' || this.indexType === 'both') {
            await this.createImageIndex(collection, existingIndexes);
        }

        const indexes = await this.listSearchIndexes(collection);
        logger.info(COMPONENT, 'Vector Search Indexes ensured', { indexes: JSON.stringify(indexes, null, 2) });
    }

    /**
     * Run full setup: collection then vector index.
     */
    async run() {
        await this.ensureCollection();
        await this.ensureVectorSearchIndex();
    }

    /**
     * Example of creating a composed index with both text and image vectors in one index (MongoDB 7.0+).
     * Not used by default since separate vector fields are more flexible for different embedding sizes and types.
     * @param {import('mongodb').Collection} collection - MongoDB collection instance
     * @param {Array<string>} existingIndexes - List of existing search indexes to avoid duplicates
     */
    async createComposedIndex(collection, existingIndexes) {
        const indexName = `${this.vectorIndexName}_composed_index`;
        if (existingIndexes.some((idx) => idx.name === indexName)) {
            logger.info(COMPONENT, 'Vector Search composed index already exists', { index: indexName });
            return;
        }
        await collection.createSearchIndex({
            name: indexName,
            type: 'vectorSearch',
            definition: {
                fields: [
                    {
                        type: 'vector',
                        path: 'embedding.text',
                        numDimensions: this.dimensionsText || 512,
                        similarity: this.similarity,
                    },
                    {
                        type: 'vector',
                        path: 'embedding.image',
                        numDimensions: this.dimensionsImage || 1024,
                        similarity: this.similarity || 'cosine'
                    },
                ],
            },
        });
        logger.info(COMPONENT, 'Composed Vector Search index created', {
            index: indexName,
            dimensionsText: this.dimensionsText,
            dimensionsImage: this.dimensionsImage,
            similarity: this.similarity,
        });
    }

    /**
     * Create vector search index for text embeddings.
     * @param {import('mongodb').Collection} collection - MongoDB collection instance
     * @param {Array<string>} existingIndexes - List of existing search indexes to avoid duplicates
     * @returns 
     */
    async createTextIndex(collection, existingIndexes) {
        const indexName = `${this.vectorIndexName}_text_index`;
        if (existingIndexes.some((idx) => idx.name === indexName)) {
            logger.info(COMPONENT, 'Vector Search Text index already exists', { index: indexName });
            return;
        }
        await collection.createSearchIndex({
            name: indexName,
            type: 'vectorSearch',
            definition: {
                fields: [
                    {
                        type: 'vector',
                        path: 'embedding.text',
                        numDimensions: this.dimensionsText || 512,
                        similarity: this.similarity || 'cosine'
                    },
                ]
            }
        });
        logger.info(COMPONENT, 'Vector Search Text index created', {
            index: indexName,
            dimensionsText: this.dimensionsText,
            dimensionsImage: this.dimensionsImage,
            similarity: this.similarity,
        });
    }

    /**
     * Create separate vector search index for image embeddings.
     * @param {import('mongodb').Collection} collection - MongoDB collection instance
     * @param {Array<string>} existingIndexes - List of existing search indexes to avoid duplicates
     * @returns 
     */
    async createImageIndex(collection, existingIndexes) {
        const indexName = `${this.vectorIndexName}_image_index`;
        if (existingIndexes.some((idx) => idx.name === indexName)) {
            logger.info(COMPONENT, 'Vector Search Image index already exists', { index: indexName });
            return;
        }
        await collection.createSearchIndex({
            name: indexName,
            type: 'vectorSearch',
            definition: {
                fields: [
                    {
                        type: 'vector',
                        path: 'embedding.image',
                        numDimensions: this.dimensionsImage || 1024,
                        similarity: this.similarity || 'cosine'
                    },
                ]
            }
        });
        logger.info(COMPONENT, 'Vector Search Image index created', {
            index: indexName,
            dimensionsText: this.dimensionsText,
            dimensionsImage: this.dimensionsImage,
            similarity: this.similarity,
        });
    }

    /**
     * Helper to list existing search indexes on the collection (MongoDB 7.0+), returns empty if not supported. Used to avoid duplicate index creation. Logs a warning if listing is not supported (e.g. older MongoDB version).
     * @param {import('mongodb').Collection} collection 
     * @returns {string[]} List of existing search indexes or empty if not supported
     */
    async listSearchIndexes(collection) {
        const existing = [];
        try {
            const indexes = collection.listSearchIndexes();
            for await (const idx of indexes) existing.push(idx);
        } catch (err) {
            logger.warn(COMPONENT, 'Could not list search indexes', { reason: err.message });
            return;
        }
        logger.info(COMPONENT, 'Existing Indexes', { indexes: JSON.stringify(existing, null, 2) });
        return existing;
    }

    /**
     * Helper to clean up existing search indexes on the collection. Used in setup to ensure a clean state. In production, you might want a more sophisticated migration strategy instead of dropping indexes.
     * @param {import('mongodb').Collection} collection
     */
    async cleanSearchIndexes(collection) {
        const indexes = await this.listSearchIndexes(collection);
        for (const index of indexes) {
            await collection.dropSearchIndex(index.name);
            logger.info(COMPONENT, 'Search index deleted', { index: index.name });
        }
    }
}
