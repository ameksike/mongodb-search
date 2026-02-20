import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';
import { MongoClient } from 'mongodb';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { StoreService } from '../services/StoreService.js';
import { FilmService } from '../services/FilmService.js';
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
    VOYAGE_IMAGE_EMBED_DELAY_MS,
    RAG_EMBEDDINGS_ON = 'false'
} = process.env;

/** Delay (ms) between image embedding API calls. Voyage free tier ≈ 3 RPM → min 20_000 ms (60s ÷ 3). Default 21s for margin. */
const embedImageDelayMs = VOYAGE_IMAGE_EMBED_DELAY_MS ? parseInt(VOYAGE_IMAGE_EMBED_DELAY_MS, 10) : 21_000;

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
        const filmService = new FilmService({ collection, srvVoyage, srvStore, embeddingsOn: RAG_EMBEDDINGS_ON });
        const imagesBasePath = path.join(__dirname, '..', 'data');
        const seedService = new SeedService(filmService, { imagesBasePath, embedImageDelayMs });
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
