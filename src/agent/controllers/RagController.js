import { Router } from 'express';
import { RagService } from '../services/RagService.js';

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
                return res
                    .status(400)
                    .json({ error: 'Missing or invalid "question" field' });
            }

            const result = await this.ragService.ask(question);
            return res.status(200).json(result);
        } catch (err) {
            console.error('[RagController] Error handling /ask:', err);
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