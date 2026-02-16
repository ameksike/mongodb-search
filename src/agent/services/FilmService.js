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

    /** Default page size for list. */
    static get defaultPageSize() {
        return 5;
    }

    /** Max page size allowed. */
    static get maxPageSize() {
        return 100;
    }

    /**
     * List films with cursor-based efficient pagination. Fetches limit+1 to detect next page without a separate count.
     * @param {{ page?: number, limit?: number, includeTotal?: boolean }} options - includeTotal: run countDocuments in parallel (extra query)
     * @returns {Promise<{ items: object[], page: number, limit: number, total?: number, totalPages?: number, hasNextPage: boolean, hasPrevPage: boolean }>}
     */
    async findAll(options = {}) {
        const limit = Math.min(FilmService.maxPageSize, Math.max(1, options.limit ?? FilmService.defaultPageSize));
        const page = Math.max(1, options.page ?? 1);
        const skip = (page - 1) * limit;
        const includeTotal = options.includeTotal === true;

        const filter = {};

        const fetchItems = async () => {
            const cursor = this.collection
                .find(filter, { projection: FilmService.projection })
                .sort({ _id: 1 })
                .skip(skip)
                .limit(limit + 1);
            return cursor.toArray();
        };

        const [rows, total] = await Promise.all([
            fetchItems(),
            includeTotal ? this.collection.countDocuments(filter) : Promise.resolve(null),
        ]);

        const hasNextPage = rows.length > limit;
        const items = hasNextPage ? rows.slice(0, limit) : rows;
        const hasPrevPage = page > 1;

        const result = {
            items,
            page,
            limit,
            hasNextPage,
            hasPrevPage,
        };
        if (total !== null) {
            result.total = total;
            result.totalPages = Math.ceil(total / limit);
        }

        logger.info(COMPONENT, 'Films listed', { count: items.length, page, limit, hasNextPage });
        return result;
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
     * Delete a film by id. Returns the deleted document (without embedding) or null if not found.
     * @param {string} id - ObjectId string
     * @returns {Promise<{ _id: import('mongodb').ObjectId, title: string, description: string, coverImage?: string, year?: number, genre?: string } | null>}
     */
    async delete(id) {
        if (!ObjectId.isValid(id)) return null;
        const doc = await this.collection.findOne(
            { _id: new ObjectId(id) },
            { projection: FilmService.projection }
        );
        if (!doc) return null;
        const res = await this.collection.deleteOne({ _id: new ObjectId(id) });
        const deleted = res.deletedCount === 1;
        if (!deleted) {
            logger.warn(COMPONENT, 'Failed to delete film', { id });
            return null;
        }
        logger.info(COMPONENT, 'Film deleted', { id });
        return doc;
    }
}
