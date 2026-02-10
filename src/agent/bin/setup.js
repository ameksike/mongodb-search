import 'dotenv/config';
import { MongoClient } from 'mongodb';

const {
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_COLLECTION,
    VECTOR_INDEX_NAME = 'rag_vector_index',
    VECTOR_DIMENSIONS,
    VECTOR_SIMILARITY = 'cosine',
    ENABLE_VECTOR_VALIDATION = 'false',
} = process.env;

if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');
if (!MONGODB_DB) throw new Error('Missing MONGODB_DB');
if (!MONGODB_COLLECTION) throw new Error('Missing MONGODB_COLLECTION');
if (!VECTOR_DIMENSIONS) throw new Error('Missing VECTOR_DIMENSIONS');

const DIM = Number(VECTOR_DIMENSIONS);
const USE_VALIDATION = ENABLE_VECTOR_VALIDATION.toLowerCase() === 'true';

const client = new MongoClient(MONGODB_URI);

async function ensureCollection(db) {
    const existsCursor = db.listCollections({ name: MONGODB_COLLECTION });
    const exists = await existsCursor.hasNext();

    if (!exists) {
        const options = {};

        if (USE_VALIDATION) {
            options.validator = {
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['embedding'],
                    properties: {
                        embedding: {
                            bsonType: 'array',
                            minItems: DIM,
                            maxItems: DIM,
                            items: { bsonType: 'double' },
                        },
                    },
                },
            };
        }

        await db.createCollection(MONGODB_COLLECTION, options);
        console.log(`Collection "${MONGODB_COLLECTION}" created${USE_VALIDATION ? ' with validator' : ''}.`);
    } else if (USE_VALIDATION) {
        await db.command({
            collMod: MONGODB_COLLECTION,
            validator: {
                $jsonSchema: {
                    bsonType: 'object',
                    required: ['embedding'],
                    properties: {
                        embedding: {
                            bsonType: 'array',
                            minItems: DIM,
                            maxItems: DIM,
                            items: { bsonType: 'double' },
                        },
                    },
                },
            },
        });
        console.log(`Validator updated on "${MONGODB_COLLECTION}".`);
    } else {
        console.log(`Collection "${MONGODB_COLLECTION}" already exists.`);
    }
}

async function ensureVectorSearchIndex(collection) {
    const existing = [];
    try {
        const cursor = collection.listSearchIndexes();
        for await (const idx of cursor) {
            existing.push(idx);
        }
    } catch (err) {
        console.warn('Could not list search indexes (maybe older MongoDB version?):', err.message);
        return;
    }

    const hasIndex = existing.some((idx) => idx.name === VECTOR_INDEX_NAME);
    if (hasIndex) {
        console.log(`Vector Search index "${VECTOR_INDEX_NAME}" already exists.`);
        return;
    }

    const indexDef = {
        name: VECTOR_INDEX_NAME,
        type: 'vectorSearch',
        definition: {
            mappings: {
                dynamic: false,
                fields: {
                    embedding: {
                        type: 'vector',
                        dimensions: DIM,
                        similarity: VECTOR_SIMILARITY,
                    },
                },
            },
        },
    };

    await collection.createSearchIndex(indexDef);
    console.log(
        `Vector Search index "${VECTOR_INDEX_NAME}" created (dim=${DIM}, similarity=${VECTOR_SIMILARITY}).`,
    );
}

async function main() {
    try {
        await client.connect();
        const db = client.db(MONGODB_DB);

        await ensureCollection(db);
        const collection = db.collection(MONGODB_COLLECTION);
        await ensureVectorSearchIndex(collection);
    } catch (err) {
        console.error('[setup] Error:', err);
        process.exitCode = 1;
    } finally {
        await client.close();
    }
}

main();
