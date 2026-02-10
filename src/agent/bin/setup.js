import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { SetupService } from '../services/SetupService.js';

// Environment variables (defaults for local/dev; override in .env)
// Required: MONGODB_URI
// Optional: MONGODB_DB, MONGODB_COLLECTION, VECTOR_INDEX_NAME, VECTOR_DIMENSIONS, VECTOR_SIMILARITY, ENABLE_VECTOR_VALIDATION
const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'chunks',
    VECTOR_INDEX_NAME = 'rag_vector_index',
    VECTOR_DIMENSIONS = '1024',           // Match your embedding model (e.g. Voyage voyage-4-large = 1024)
    VECTOR_SIMILARITY = 'cosine',         // 'cosine' | 'euclidean' | 'dotProduct'
    ENABLE_VECTOR_VALIDATION = 'false',   // 'true' to enforce embedding array length in schema
} = process.env;

if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI');
}

const client = new MongoClient(MONGODB_URI);

try {
    await client.connect();
    const db = client.db(MONGODB_DB);
    const setupService = new SetupService(db, {
        collectionName: MONGODB_COLLECTION,
        vectorIndexName: VECTOR_INDEX_NAME,
        dimensions: Number(VECTOR_DIMENSIONS),
        similarity: VECTOR_SIMILARITY,
        enableValidation: ENABLE_VECTOR_VALIDATION.toLowerCase() === 'true',
    });
    await setupService.run();
} catch (err) {
    console.error('[setup] Error:', err);
    process.exitCode = 1;
} finally {
    await client.close();
}