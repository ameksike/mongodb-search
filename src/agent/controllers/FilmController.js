import { Router } from 'express';
import { FilmService } from '../services/FilmService.js';
import { logger } from '../utils/logger.js';

const COMPONENT = 'film';

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
        this.router.post('/', this.create.bind(this));
        this.router.get('/', this.list.bind(this));
        this.router.get('/:id', this.getOne.bind(this));
        this.router.put('/:id', this.update.bind(this));
        this.router.delete('/:id', this.delete.bind(this));
    }

    async create(req, res) {
        try {
            const { title, description, coverImage, year, genre } = req.body ?? {};
            if (!title || typeof title !== 'string' || title.trim() === '') {
                logger.warn(COMPONENT, 'Create rejected', { reason: 'Missing or invalid title' });
                return res.status(400).json({ error: 'Missing or invalid "title" field' });
            }
            const film = await this.filmService.create({
                title: title.trim(),
                description: typeof description === 'string' ? description.trim() : '',
                coverImage: typeof coverImage === 'string' ? coverImage.trim() : undefined,
                year: typeof year === 'number' && Number.isInteger(year) ? year : undefined,
                genre: typeof genre === 'string' ? genre.trim() : undefined,
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
            const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
            const films = await this.filmService.findAll({ page, limit });
            return res.status(200).json(films);
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
            const { title, description, coverImage, year, genre } = req.body ?? {};
            const updates = {};
            if (title !== undefined) {
                if (typeof title !== 'string') {
                    return res.status(400).json({ error: 'Invalid "title" field' });
                }
                updates.title = title.trim();
            }
            if (description !== undefined) updates.description = typeof description === 'string' ? description.trim() : '';
            if (coverImage !== undefined) updates.coverImage = typeof coverImage === 'string' ? coverImage.trim() : '';
            if (year !== undefined && typeof year === 'number' && Number.isInteger(year)) updates.year = year;
            if (genre !== undefined) updates.genre = typeof genre === 'string' ? genre.trim() : '';

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
            return res.status(204).send();
        } catch (err) {
            logger.error(COMPONENT, 'Delete failed', { error: err.message });
            return res.status(500).json({
                error: 'Internal server error',
                details: process.env.NODE_ENV === 'development' && err ? err.message : undefined,
            });
        }
    }
}
