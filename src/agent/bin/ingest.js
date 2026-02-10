import 'dotenv/config';
import { MongoClient } from 'mongodb';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { SeedService } from '../services/SeedService.js';
import { seedDocuments } from '../data/seedDocuments.js';

const {
    MONGODB_URI,
    MONGODB_DB = 'rag',
    MONGODB_COLLECTION = 'chunks',
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
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

async function main() {
    try {
        await client.connect();
        const collection = client.db(MONGODB_DB).collection(MONGODB_COLLECTION);
        const seedService = new SeedService(collection, srvVoyage);
        await seedService.run(seedDocuments);
    } finally {
        await client.close();
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
