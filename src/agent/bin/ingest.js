import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { StoreService } from '../services/StoreService.js';
import { SeedService } from '../services/SeedService.js';
import { films as seedDocuments } from '../data/films.js';
import { logger } from '../utils/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'films',
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
    STORE_BUCKET,
} = process.env;

if (!MONGODB_URI || !MONGODB_DB || !MONGODB_COLLECTION) {
    throw new Error('Missing MONGODB_URI, MONGODB_DB, or MONGODB_COLLECTION');
}
if (!VOYAGE_API_URL || !VOYAGE_API_KEY || !VOYAGE_MODEL) {
    throw new Error('Missing VoyageAI configuration');
}

const client = new MongoClient(MONGODB_URI);
const srvVoyage = new VoyageAIService({
    apiUrl: VOYAGE_API_URL,
    apiKey: VOYAGE_API_KEY,
    model: VOYAGE_MODEL,
});
const srvStore = STORE_BUCKET ? new StoreService() : null;

const COMPONENT = 'ingest';
async function main() {
    try {
        logger.info(COMPONENT, 'Connecting to MongoDB', { db: MONGODB_DB, collection: MONGODB_COLLECTION });
        await client.connect();
        const collection = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);
        const imagesBasePath = path.join(__dirname, '..', 'data');
        const seedService = new SeedService(collection, srvVoyage, { imagesBasePath, srvStore });
        await seedService.run(seedDocuments);
    } finally {
        await client.close();
        logger.info(COMPONENT, 'MongoDB connection closed');
    }
}

main().catch((err) => {
    logger.error(COMPONENT, 'Seed failed', { error: err.message });
    process.exit(1);
});
