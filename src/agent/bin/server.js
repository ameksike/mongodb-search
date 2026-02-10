import 'dotenv/config';
import express from 'express';
import { MongoClient } from 'mongodb';
import { RagService } from '../services/RagService.js';
import { OllamaService } from '../services/OllamaService.js';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { RagController } from '../controllers/RagController.js';
import { logger } from '../utils/logger.js';

const {
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_COLLECTION,
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
    OLLAMA_MODEL,
    PORT = 3000,
} = process.env;

const COMPONENT = 'server';
try {
    logger.info(COMPONENT, 'Starting', { port: PORT });
    if (!MONGODB_URI) throw new Error('Missing MONGODB_URI');
    if (!MONGODB_DB) throw new Error('Missing MONGODB_DB');
    if (!MONGODB_COLLECTION) throw new Error('Missing MONGODB_COLLECTION');

    if (!VOYAGE_API_URL || !VOYAGE_API_KEY || !VOYAGE_MODEL) {
        throw new Error('Missing VoyageAI configuration');
    }

    if (!OLLAMA_MODEL) {
        throw new Error('Missing Ollama model configuration');
    }

    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    logger.info(COMPONENT, 'MongoDB connected', { db: MONGODB_DB });

    const ragService = new RagService({
        db: mongoClient.db(MONGODB_DB),
        collectionName: MONGODB_COLLECTION,
        srvVoyage: new VoyageAIService({
            apiUrl: VOYAGE_API_URL,
            apiKey: VOYAGE_API_KEY,
            model: VOYAGE_MODEL,
        }),
        srvLLM: new OllamaService({
            model: OLLAMA_MODEL,
        })
    });

    const ragController = new RagController(ragService);

    const app = express();
    app.use(express.json());

    app.use('/api/rag', ragController.router);

    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

    app.listen(PORT, () => {
        logger.info(COMPONENT, 'Listening', { url: `http://localhost:${PORT}`, health: '/api/health', ask: '/api/rag/ask' });
    });
} catch (err) {
    logger.error(COMPONENT, 'Bootstrap failed', { error: err.message });
    process.exit(1);
}
