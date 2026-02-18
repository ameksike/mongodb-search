import { Router } from 'express';
import { FilmService } from '../services/FilmService.js';
import { logger } from '../utils/logger.js';
import { multipart } from '../utils/utl.js';

const COMPONENT = 'controller:film';

export class FilmController {

    /**
     * @param {FilmService} filmService
     */
    constructor(filmService) {
        this.filmService = filmService;
        this.router = Router();
        this.registerRoutes();
    }

    registerRoutes() {
        this.router.post('/', multipart, this.create.bind(this));
        this.router.get('/', this.list.bind(this));
        this.router.get('/:id', this.getOne.bind(this));
        this.router.put('/:id', multipart, this.update.bind(this));
        this.router.delete('/:id', this.delete.bind(this));
    }

    async create(req, res) {
        try {
            const payload = this.normalizeBody(req);
            const title = payload.title;
            if (!title || title === '') {
                logger.warn(COMPONENT, 'Create rejected', { reason: 'Missing or invalid title' });
                return res.status(400).json({ error: 'Missing or invalid "title" field' });
            }
            const film = await this.filmService.create({
                title,
                description: payload.description ?? '',
                coverImage: payload.coverImage,
                year: payload.year,
                genre: payload.genre,
                coverImageBuffer: payload.coverImageBuffer,
                coverImageMimetype: payload.coverImageMimetype,
                coverImageOriginalname: payload.coverImageOriginalname,
            });
            return res.status(201).json(film);
        } catch (err) {
            logger.error(COMPONENT, 'Create failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }

    async list(req, res) {
        try {
            const page = Math.max(1, parseInt(req.query.page, 10) || 1);
            const limitParam = parseInt(req.query.limit, 10);
            const limit = Number.isNaN(limitParam) || limitParam < 1
                ? FilmService.defaultPageSize
                : Math.min(FilmService.maxPageSize, limitParam);
            const includeTotal = req.query.includeTotal === 'true';

            const result = await this.filmService.findAll({ page, limit, includeTotal });
            return res.status(200).json(result);
        } catch (err) {
            logger.error(COMPONENT, 'List failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }

    async getOne(req, res) {
        try {
            const { id } = req.params;
            const film = await this.filmService.findById(id);
            if (!film) {
                return res.status(404).json({ error: 'Film not found' });
            }
            return res.status(200).json(film);
        } catch (err) {
            logger.error(COMPONENT, 'Get one failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }

    async update(req, res) {
        try {
            const { id } = req.params;
            const payload = this.normalizeBody(req);
            const updates = {};
            if (payload.title !== undefined) {
                if (typeof payload.title !== 'string' || payload.title === '') {
                    return res.status(400).json({ error: 'Invalid "title" field' });
                }
                updates.title = payload.title;
            }
            if (payload.description !== undefined) updates.description = payload.description;
            if (payload.coverImage !== undefined) updates.coverImage = payload.coverImage;
            if (payload.year !== undefined) updates.year = payload.year;
            if (payload.genre !== undefined) updates.genre = payload.genre;
            if (payload.coverImageBuffer) {
                updates.coverImageBuffer = payload.coverImageBuffer;
                updates.coverImageMimetype = payload.coverImageMimetype;
                updates.coverImageOriginalname = payload.coverImageOriginalname;
            }

            if (Object.keys(updates).length === 0) {
                const current = await this.filmService.findById(id);
                if (!current) return res.status(404).json({ error: 'Film not found' });
                return res.status(200).json(current);
            }

            const film = await this.filmService.update(id, updates);
            if (!film) {
                return res.status(404).json({ error: 'Film not found' });
            }
            return res.status(200).json(film);
        } catch (err) {
            logger.error(COMPONENT, 'Update failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deleted = await this.filmService.delete(id);
            if (!deleted) {
                return res.status(404).json({ error: 'Film not found' });
            }
            return res.status(200).json(deleted);
        } catch (err) {
            logger.error(COMPONENT, 'Delete failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }

    /**
     * Normalize payload from req (JSON or form-data). Form-data fields are strings; year is parsed.
     * @param {express.Request} req
     * @returns {{ title?: string, description?: string, coverImage?: string, year?: number, genre?: string, coverImageBuffer?: Buffer, coverImageMimetype?: string, coverImageOriginalname?: string }}
     */
    normalizeBody(req) {
        const body = req.body ?? {};
        const title = body.title != null ? String(body.title).trim() : undefined;
        const description = body.description != null ? String(body.description || body.text || body.des).trim() : undefined;
        let coverImage = body.coverImage != null ? String(body.coverImage).trim() : undefined;
        let year = body.year;
        if (typeof year === 'string') year = parseInt(year, 10);
        if (typeof year !== 'number' || !Number.isInteger(year)) year = undefined;
        const genre = body.genre != null ? String(body.genre).trim() : undefined;

        const payload = { title, description, coverImage, year, genre };
        const file = req.files?.coverImage?.[0] ?? req.files?.image?.[0];
        if (file && Buffer.isBuffer(file.buffer)) {
            payload.coverImageBuffer = file.buffer;
            payload.coverImageMimetype = file.mimetype ?? 'application/octet-stream';
            payload.coverImageOriginalname = file.originalname ?? '';
        }
        return payload;
    }
}
