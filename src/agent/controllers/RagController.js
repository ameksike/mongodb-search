import { Router } from 'express';
import { RagService } from '../services/RagService.js';
import { logger } from '../utils/logger.js';

const COMPONENT = 'controller:rag';

/** Parse data URL to buffer and mime type. Returns { buffer, mimeType } or null. */
function parseDataUrl(dataUrl) {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return null;
    try {
        const mimeType = match[1].trim().toLowerCase();
        const base64 = match[2].replace(/\s/g, '');
        const buffer = Buffer.from(base64, 'base64');
        return buffer.length ? { buffer, mimeType } : null;
    } catch {
        return null;
    }
}

export class RagController {
    constructor(ragService) {
        /** @type {RagService} */
        this.ragService = ragService;
        this.router = Router();
        this.registerRoutes();
    }

    registerRoutes() {
        this.router.post('/ask', this.handleAskText.bind(this));
        this.router.post('/ask/text', this.handleAskText.bind(this));
        this.router.post('/ask/image', this.handleAskImage.bind(this));
        this.router.post('/ask/hybrid', this.handleAskHybrid.bind(this));
    }

    applyCallFlag(req) {
        if (req.query?.call !== undefined) {
            this.ragService.srvLLM.call = req.query.call === 'true';
        }
    }

    async handleAskText(req, res) {
        try {
            const { question } = req.body ?? {};
            if (!question || typeof question !== 'string' || !question.trim()) {
                logger.warn(COMPONENT, 'Invalid request', { reason: 'Missing or invalid question' });
                return res.status(400).json({ error: 'Missing or invalid "question" field' });
            }
            this.applyCallFlag(req);
            const k = Math.min(20, Math.max(1, parseInt(req.query.k, 10) || 5));
            logger.info(COMPONENT, 'Ask text', { questionLength: question.length });
            const result = await this.ragService.askText(question.trim(), { k });
            logger.info(COMPONENT, 'Ask text done', { contextChunks: result.contextChunks?.length ?? 0 });
            return res.status(200).json(result);
        } catch (err) {
            logger.error(COMPONENT, 'Ask text failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            });
        }
    }

    async handleAskImage(req, res) {
        try {
            const body = req.body ?? {};
            const parsed = parseDataUrl(body.image);
            if (!parsed) {
                logger.warn(COMPONENT, 'Invalid request', { reason: 'Missing or invalid image (expect data URL in body.image)' });
                return res.status(400).json({
                    error: 'Missing or invalid "image" field. Send a data URL: { "image": "data:image/jpeg;base64,...", "question": "optional" }',
                });
            }
            this.applyCallFlag(req);
            const k = Math.min(20, Math.max(1, parseInt(req.query.k, 10) || 5));
            const question = typeof body.question === 'string' ? body.question.trim() : undefined;
            logger.info(COMPONENT, 'Ask image', { size: parsed.buffer.length, mimeType: parsed.mimeType });
            const result = await this.ragService.askImage(parsed.buffer, parsed.mimeType, { question, k });
            logger.info(COMPONENT, 'Ask image done', { contextChunks: result.contextChunks?.length ?? 0 });
            return res.status(200).json(result);
        } catch (err) {
            logger.error(COMPONENT, 'Ask image failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            });
        }
    }

    async handleAskHybrid(req, res) {
        try {
            const { question } = req.body ?? {};
            if (!question || typeof question !== 'string' || !question.trim()) {
                logger.warn(COMPONENT, 'Invalid request', { reason: 'Missing or invalid question' });
                return res.status(400).json({ error: 'Missing or invalid "question" field' });
            }
            this.applyCallFlag(req);
            const k = Math.min(20, Math.max(1, parseInt(req.query.k, 10) || 5));
            logger.info(COMPONENT, 'Ask hybrid', { questionLength: question.length });
            const result = await this.ragService.askHybrid(question.trim(), { k });
            logger.info(COMPONENT, 'Ask hybrid done', { contextChunks: result.contextChunks?.length ?? 0 });
            return res.status(200).json(result);
        } catch (err) {
            logger.error(COMPONENT, 'Ask hybrid failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' ? err.message : undefined,
            });
        }
    }
}
