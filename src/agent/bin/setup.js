import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { SetupService } from '../services/SetupService.js';
import { logger } from '../utils/logger.js';

// Environment variables (defaults for local/dev; override in .env)
// Required: MONGODB_URI
// Optional: MONGODB_DB, MONGODB_COLLECTION, VECTOR_INDEX_NAME, VECTOR_DIMENSIONS, VECTOR_DIMENSIONS_TEXT, VECTOR_DIMENSIONS_IMAGE, VECTOR_SIMILARITY, ENABLE_VECTOR_VALIDATION
const {
    MONGODB_URI,                                 // MongoDB connection string
    MONGODB_DB = 'rag',                          // Database name
    MONGODB_COLLECTION = 'films',                // Collection to store documents with embeddings
    MONGODB_VECTOR_VALIDATION = 'true',          // 'true' to enforce schema (title, description, coverImage, embedding.text, embedding.image)
    VECTOR_INDEX_NAME = 'rag_vector_index',      // Base name for vector indexes; actual index names will be `${VECTOR_INDEX_NAME}_text_index` and `${VECTOR_INDEX_NAME}_image_index`
    VECTOR_DIMENSIONS = '1024',                  // Used for both if VECTOR_DIMENSIONS_TEXT/IMAGE not set
    VECTOR_DIMENSIONS_TEXT,                      // Text embedding size (e.g. Voyage 1024)
    VECTOR_DIMENSIONS_IMAGE,                     // Image embedding size (e.g. CLIP 512)
    VECTOR_SIMILARITY = 'cosine',                // 'cosine' | 'euclidean' | 'dotProduct'
    VECTOR_INDEX_TYPE = 'both',                  // 'image' | 'text' | 'composed' | 'both'
} = process.env;

const COMPONENT = 'setup';
if (!MONGODB_URI) {
    throw new Error('Missing MONGODB_URI');
}

const client = new MongoClient(MONGODB_URI);

try {
    logger.info(COMPONENT, 'Connecting to MongoDB', { db: MONGODB_DB, collection: MONGODB_COLLECTION });
    await client.connect();
    const db = client.db(MONGODB_DB);
    const dim = Number(VECTOR_DIMENSIONS);
    const setupService = new SetupService(db, {
        collectionName: MONGODB_COLLECTION,
        vectorIndexName: VECTOR_INDEX_NAME,
        dimensions: dim,
        dimensionsText: VECTOR_DIMENSIONS_TEXT != null ? Number(VECTOR_DIMENSIONS_TEXT) : undefined,
        dimensionsImage: VECTOR_DIMENSIONS_IMAGE != null ? Number(VECTOR_DIMENSIONS_IMAGE) : undefined,
        similarity: VECTOR_SIMILARITY,
        enableValidation: MONGODB_VECTOR_VALIDATION.toLowerCase() === 'true',
        indexType: VECTOR_INDEX_TYPE,
    });
    logger.info(COMPONENT, 'Running setup', { vectorIndexName: VECTOR_INDEX_NAME, dimensionsText: setupService.dimensionsText, dimensionsImage: setupService.dimensionsImage });
    await setupService.run();
    logger.info(COMPONENT, 'Setup complete');
} catch (err) {
    logger.error(COMPONENT, 'Setup failed', { error: err.message });
    process.exitCode = 1;
} finally {
    await client.close();
    logger.info(COMPONENT, 'MongoDB connection closed');
}