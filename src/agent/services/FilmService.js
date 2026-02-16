import { ObjectId } from 'mongodb';
import { logger } from '../utils/logger.js';

const COMPONENT = 'film';

/**
 * Service for films CRUD. Uses the same collection as RAG; creates/updates compute text embedding via VoyageAI.
 */
export class FilmService {

    /**
     * @param {import('mongodb').Collection} collection - MongoDB collection (same as RAG)
     * @param {InstanceType<import('./VoyageAIService.js').VoyageAIService>} [srvVoyage] - Optional; required for create/update to embed description
     */
    constructor(collection, srvVoyage) {
        this.collection = collection;
        this.srvVoyage = srvVoyage;
    }

    /** Projection for film responses (no embedding). */
    static get projection() {
        return { title: 1, description: 1, coverImage: 1, year: 1, genre: 1 };
    }

    /**
     * Create a film: embed description, insert document with embedding.text (embedding.image empty).
     * @param {{ title: string, description: string, coverImage?: string, year?: number, genre?: string }} film
     * @returns {Promise<{ _id: import('mongodb').ObjectId, title: string, description: string, coverImage?: string, year?: number, genre?: string }>}
     */
    async create(film) {
        const { title, description, coverImage, year, genre } = film;
        const textToEmbed = [description ?? title ?? ''];
        const textEmbeddings = this.srvVoyage
            ? await this.srvVoyage.getEmbedding(textToEmbed)
            : [[]];
        const doc = {
            title,
            description: description ?? '',
            coverImage: coverImage ?? '',
            embedding: {
                text: textEmbeddings[0] ?? [],
                image: [],
            },
        };
        if (year !== undefined) doc.year = year;
        if (genre !== undefined) doc.genre = genre;
        const res = await this.collection.insertOne(doc);
        logger.info(COMPONENT, 'Film created', { id: res.insertedId, title });
        return this.findById(res.insertedId.toString());
    }

    /**
     * Get one film by id (excludes embedding from response).
     * @param {string} id - ObjectId string
     * @returns {Promise<{ _id: import('mongodb').ObjectId, title: string, description: string, coverImage?: string } | null>}
     */
    async findById(id) {
        if (!ObjectId.isValid(id)) return null;
        const doc = await this.collection.findOne(
            { _id: new ObjectId(id) },
            { projection: FilmService.projection }
        );
        return doc;
    }

    /**
     * List films with optional pagination.
     * @param {{ page?: number, limit?: number }} options
     * @returns {Promise<{ _id: import('mongodb').ObjectId, title: string, description: string, coverImage?: string }[]>}
     */
    async findAll(options = {}) {
        const { page = 1, limit = 20 } = options;
        const skip = Math.max(0, (page - 1) * limit);
        const cursor = this.collection
            .find({}, { projection: FilmService.projection })
            .skip(skip)
            .limit(Math.min(100, Math.max(1, limit)));
        const list = await cursor.toArray();
        logger.info(COMPONENT, 'Films listed', { count: list.length, page, limit });
        return list;
    }

    /**
     * Update a film; if description is provided, re-embed and update embedding.text.
     * @param {string} id - ObjectId string
     * @param {{ title?: string, description?: string, coverImage?: string, year?: number, genre?: string }} film
     * @returns {Promise<{ _id: import('mongodb').ObjectId, title: string, description: string, coverImage?: string, year?: number, genre?: string } | null>}
     */
    async update(id, film) {
        if (!ObjectId.isValid(id)) return null;
        const existing = await this.collection.findOne({ _id: new ObjectId(id) });
        if (!existing) return null;

        const updateFields = {};
        if (film.title !== undefined) updateFields.title = film.title;
        if (film.description !== undefined) updateFields.description = film.description;
        if (film.coverImage !== undefined) updateFields.coverImage = film.coverImage;
        if (film.year !== undefined) updateFields.year = film.year;
        if (film.genre !== undefined) updateFields.genre = film.genre;

        if (film.description !== undefined && this.srvVoyage) {
            const [embedding] = await this.srvVoyage.getEmbedding([film.description]);
            updateFields['embedding.text'] = embedding ?? existing.embedding?.text ?? [];
        }

        if (Object.keys(updateFields).length === 0) return this.findById(id);

        await this.collection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updateFields }
        );
        logger.info(COMPONENT, 'Film updated', { id, keys: Object.keys(updateFields) });
        return this.findById(id);
    }

    /**
     * Delete a film by id.
     * @param {string} id - ObjectId string
     * @returns {Promise<boolean>} true if deleted
     */
    async delete(id) {
        if (!ObjectId.isValid(id)) return false;
        const res = await this.collection.deleteOne({ _id: new ObjectId(id) });
        const deleted = res.deletedCount === 1;
        if (deleted) logger.info(COMPONENT, 'Film deleted', { id });
        return deleted;
    }
}
