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
 * Seed service: embed text + cover images (VoyageAI), optionally upload images to StoreService, insert into MongoDB.
 */
export class SeedService {

    /**
     * @param {import('mongodb').Collection} collection
     * @param {InstanceType<import('./VoyageAIService.js').VoyageAIService>} srvVoyage
     * @param {{ imagesBasePath?: string, srvStore?: InstanceType<import('./StoreService.js').StoreService> }} [options]
     */
    constructor(collection, srvVoyage, options = {}) {
        this.collection = collection;
        this.srvVoyage = srvVoyage;
        this.imagesBasePath = options.imagesBasePath ?? null;
        this.srvStore = options.srvStore ?? null;
    }

    /**
     * Load image buffer from imagesBasePath + coverImage path.
     * @param {string} coverImagePath
     * @returns {Promise<Buffer | null>}
     */
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
     * For one doc: load image → upload to store (if configured) → get image embedding. Returns { coverImageUrl, imageEmbedding }.
     */
    async processImage(doc) {
        const coverImage = doc.coverImage ?? '';
        const buffer = await this.loadImage(coverImage);
        let coverImageUrl = coverImage;
        let imageEmbedding = [];

        if (buffer?.length) {
            if (this.srvStore) {
                try {
                    coverImageUrl = await this.srvStore.upload(buffer, {
                        key: `seed/${coverImage}`,
                        contentType: mimeFromPath(coverImage),
                    });
                } catch (err) {
                    logger.warn(COMPONENT, 'Store upload failed', { coverImage, error: err.message });
                }
            }
            if (typeof this.srvVoyage.getImageEmbedding === 'function') {
                const emb = await this.srvVoyage.getImageEmbedding(buffer, mimeFromPath(coverImage));
                imageEmbedding = Array.isArray(emb) ? emb : [];
            }
        }

        return { coverImageUrl, imageEmbedding };
    }

    /**
     * Ingest documents: batch text embeddings, per-doc image load/upload/embed, insertMany.
     * @param {{ title: string, description?: string, text?: string, coverImage?: string, year?: number, genre?: string }[]} documents
     */
    async run(documents) {
        if (documents.length === 0) {
            logger.info(COMPONENT, 'No documents to ingest');
            return;
        }

        const textFromDoc = (d) => d.description ?? d.text ?? '';
        const texts = documents.map(textFromDoc);

        const [textEmbeddings, imageResults] = await Promise.all([
            this.srvVoyage.getEmbedding(texts),
            Promise.all(documents.map((doc) => this.processImage(doc))),
        ]);

        const withEmbedding = imageResults.filter((r) => r.imageEmbedding.length).length;
        logger.info(COMPONENT, 'Embeddings ready', { text: textEmbeddings?.length ?? 0, image: withEmbedding });

        const docsToInsert = documents.map((doc, i) => {
            const { coverImageUrl, imageEmbedding } = imageResults[i];
            const base = {
                title: doc.title,
                description: textFromDoc(doc),
                coverImage: coverImageUrl,
                embedding: {
                    text: textEmbeddings?.[i] ?? [],
                    image: imageEmbedding,
                },
            };
            if (doc.year !== undefined) base.year = doc.year;
            if (doc.genre !== undefined) base.genre = doc.genre;
            return base;
        });

        const res = await this.collection.insertMany(docsToInsert);
        logger.info(COMPONENT, 'Ingest complete', { inserted: res.insertedCount });
    }
}
