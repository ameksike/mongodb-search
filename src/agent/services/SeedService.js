import fs from 'fs/promises';
import path from 'path';
import { logger } from '../utils/logger.js';

const COMPONENT = 'service:seed';

function mimeFromPath(filePath) {
    const ext = path.extname(filePath || '').toLowerCase();
    if (ext === '.png') return 'image/png';
    if (ext === '.webp') return 'image/webp';
    if (ext === '.gif') return 'image/gif';
    return 'image/jpeg';
}

/**
 * Seed service: creates RAG documents via FilmService.create (upload, embeddings, insert).
 * FilmService handles text + image embeddings when generateEmbeddings is enabled.
 */
export class SeedService {

    /**
     * @param {InstanceType<import('./FilmService.js').FilmService>} filmService
     * @param {{ imagesBasePath?: string, embedImageDelayMs?: number }} [options]
     */
    constructor(filmService, options = {}) {
        this.filmService = filmService;
        this.imagesBasePath = options.imagesBasePath ?? null;
        this.embedImageDelayMs = options.embedImageDelayMs ?? 0;
    }

    /** Load image buffer from imagesBasePath + coverImage path. */
    async loadImage(coverImagePath) {
        if (!this.imagesBasePath || !coverImagePath) return null;
        try {
            return await fs.readFile(path.join(this.imagesBasePath, coverImagePath));
        } catch (err) {
            logger.warn(COMPONENT, 'Image file not found', { path: coverImagePath, error: err.message });
            return null;
        }
    }

    /**
     * Ingest documents: for each doc, build film payload and call filmService.create(film).
     * @param {{ title: string, description?: string, text?: string, coverImage?: string, year?: number, genre?: string }[]} documents
     */
    async run(documents) {
        if (documents.length === 0) {
            logger.info(COMPONENT, 'No documents to ingest');
            return;
        }

        const getDescription = (d) => d.description ?? d.text ?? '';

        for (let i = 0; i < documents.length; i++) {
            if (this.embedImageDelayMs > 0 && i > 0) {
                await new Promise((r) => setTimeout(r, this.embedImageDelayMs));
            }

            const doc = documents[i];
            const coverImage = doc.coverImage ?? '';
            const buffer = await this.loadImage(coverImage);

            const film = {
                title: doc.title,
                description: getDescription(doc),
                year: doc.year,
                genre: doc.genre,
                coverImage,
            };
            if (buffer?.length) {
                film.coverImageBuffer = buffer;
                film.coverImageMimetype = mimeFromPath(coverImage);
                film.coverImageOriginalname = path.basename(coverImage);
            }

            await this.filmService.create(film);
        }

        logger.info(COMPONENT, 'Ingest complete', { inserted: documents.length });
    }
}
