import { Router } from 'express';
import multer from 'multer';
import { FilmService } from '../services/FilmService.js';
import { logger } from '../utils/logger.js';

const COMPONENT = 'controller:film';

/** Max cover image size (5MB). */
const COVER_IMAGE_LIMIT = process.env.STORE_IMAGE_LIMIT ? parseInt(process.env.STORE_IMAGE_LIMIT, 10) : 5 * 1024 * 1024;

/** Multer: accept one file from either "coverImage" or "image" to avoid LIMIT_UNEXPECTED_FILE when client uses a different field name. */
const uploadCover = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: COVER_IMAGE_LIMIT },
}).fields([
    { name: 'coverImage', maxCount: 1 },
    { name: 'image', maxCount: 1 },
]);

/**
 * Run multer only when request is multipart/form-data so JSON body is left to express.json().
 * @param {express.Request} req
 * @param {express.Response} res
 * @param {express.NextFunction} next
 */
function multipart(req, res, next) {
    if (req.is('multipart/form-data')) {
        uploadCover(req, res, (err) => {
            if (err) {
                logger.warn(COMPONENT, 'Multipart parse failed', { error: err.message, code: err.code });
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    } else next();
}

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
