import 'dotenv/config';
import express from 'express';
import { MongoClient } from 'mongodb';
import { RagService } from '../services/RagService.js';
import { OllamaService } from '../services/OllamaService.js';
import { VoyageAIService } from '../services/VoyageAIService.js';
import { RagController } from '../controllers/RagController.js';
import { FilmController } from '../controllers/FilmController.js';
import { FilmService } from '../services/FilmService.js';
import { StoreService } from '../services/StoreService.js';
import { logger } from '../utils/logger.js';

const {
    MONGODB_URI,
    MONGODB_DB,
    MONGODB_COLLECTION,
    VOYAGE_API_URL,
    VOYAGE_API_KEY,
    VOYAGE_MODEL,
    VOYAGE_MODEL_RERANK,
    LLM_MODEL,
    LLM_CALL,
    LLM_URL,
    PORT = 3000,
    AWS_REGION,
    STORE_BUCKET = 'films',
    STORE_ENDPOINT = 'http://127.0.0.1:9000',
    STORE_DRIVER = 'MinIO',
    SEARCH_INDEX_NAME,
    RAG_RERANK_ON = 'false',
    RAG_EMBEDDINGS_ON = 'false'
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

    if (!LLM_MODEL) {
        throw new Error('Missing Ollama model configuration');
    }

    const mongoClient = new MongoClient(MONGODB_URI);
    await mongoClient.connect();
    logger.info(COMPONENT, 'MongoDB connected', { db: MONGODB_DB });

    const srvVoyage = new VoyageAIService({
        apiUrl: VOYAGE_API_URL,
        apiKey: VOYAGE_API_KEY,
        model: VOYAGE_MODEL,
        rerankModel: VOYAGE_MODEL_RERANK,
    });

    const db = mongoClient.db(MONGODB_DB);
    const collection = db.collection(MONGODB_COLLECTION);

    const ragService = new RagService({
        db,
        srvVoyage,
        collectionName: MONGODB_COLLECTION,
        srvLLM: new OllamaService({
            model: LLM_MODEL,
            call: LLM_CALL === 'true',
            baseUrl: LLM_URL,
        }),
        searchIndexName: SEARCH_INDEX_NAME || undefined,
        useRerank: RAG_RERANK_ON === 'true' || RAG_RERANK_ON === '1',
    });

    const srvStore = STORE_BUCKET
        ? new StoreService({
            bucket: STORE_BUCKET,
            region: AWS_REGION,
            endpoint: STORE_ENDPOINT,
            driver: STORE_DRIVER,
        })
        : null;
    const filmService = new FilmService({ collection, srvStore, embeddingsOn: RAG_EMBEDDINGS_ON });
    const ragController = new RagController(ragService);
    const filmController = new FilmController(filmService);

    const app = express();
    app.use(express.json({ limit: '10mb' }));

    app.use('/api/films', ragController.router);
    app.use('/api/films', filmController.router);

    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

    app.listen(PORT, '0.0.0.0', () => {
        logger.info(COMPONENT, 'Listening', {
            url: `http://localhost:${PORT}`,
            health: '/api/health',
            ask: '/api/films/ask',
            askText: '/api/films/ask/text',
            askImage: '/api/films/ask/image',
            askHybrid: '/api/films/ask/hybrid',
            films: '/api/films',
        });
    });
} catch (err) {
    logger.error(COMPONENT, 'Bootstrap failed', { error: err.message });
    process.exit(1);
}
