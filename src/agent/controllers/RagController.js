import { Router } from 'express';
import { RagService } from '../services/RagService.js';
import { logger } from '../utils/logger.js';

const COMPONENT = 'rag';

export class RagController {
    constructor(ragService) {
        /** @type {RagService} */
        this.ragService = ragService;
        this.router = Router();
        this.registerRoutes();
    }

    registerRoutes() {
        this.router.post('/ask', this.handleAsk.bind(this));
    }

    async handleAsk(req, res) {
        try {
            const { question } = req.body;

            if (!question || typeof question !== 'string') {
                logger.warn(COMPONENT, 'Invalid request', { reason: 'Missing or invalid question field' });
                return res
                    .status(400)
                    .json({ error: 'Missing or invalid "question" field' });
            }

            req.query.call && (this.ragService.srvLLM.call = req.query.call === 'true');

            this.ragService.srvLLM.call

            logger.info(COMPONENT, 'Ask received', { questionLength: question.length });
            const result = await this.ragService.ask(question);
            logger.info(COMPONENT, 'Ask completed', { contextChunks: result.contextChunks?.length ?? 0 });
            return res.status(200).json(result);
        } catch (err) {
            logger.error(COMPONENT, 'Ask failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details:
                    process.env.NODE_ENV === 'development' && err
                        ? err.message
                        : undefined,
            });
        }
    }
}