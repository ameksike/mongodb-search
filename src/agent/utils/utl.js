import multer from 'multer';
import { logger } from './logger.js';

const COMPONENT_UTL = 'util:multipart';

/** Default max image size (5MB). */
const DEFAULT_IMAGE_LIMIT = 5 * 1024 * 1024;

/**
 * Create multer middleware that runs only for multipart/form-data. Configurable field names and size limit.
 * @param {{ fieldNames?: string[], fileSizeLimit?: number, component?: string }} [options]
 * @returns {express.RequestHandler}
 */
export function multipart(options = {}) {
    const fieldNames = options.fieldNames ?? ['image', 'file', 'coverImage'];
    const fileSizeLimit = options.fileSizeLimit ?? (process.env.STORE_IMAGE_LIMIT ? parseInt(process.env.STORE_IMAGE_LIMIT, 10) : DEFAULT_IMAGE_LIMIT);
    const component = options.component ?? COMPONENT_UTL;

    const upload = multer({
        storage: multer.memoryStorage(),
        limits: { fileSize: fileSizeLimit },
    }).fields(fieldNames.map((name) => ({ name, maxCount: 1 })));

    return function multipartMiddleware(req, res, next) {
        if (req.is('multipart/form-data')) {
            upload(req, res, (err) => {
                if (err) {
                    logger.warn(component, 'Multipart parse failed', { error: err.message, code: err.code });
                    return res.status(400).json({ error: err.message });
                }
                next();
            });
        } else next();
    };
}

/**
 * Parse data URL to buffer and mime type. Returns { buffer, mimeType } or null.
 * @param {string} [dataUrl]
 * @returns {{ buffer: Buffer, mimeType: string } | null}
 */
export function parseDataUrl(dataUrl) {
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

/**
 * Get image from request: form-data (first file in given field names) or JSON body.image (data URL).
 * @param {express.Request} req
 * @param {string[]} [fieldNames] - form-data field names to check (default: image, file, coverImage)
 * @returns {{ buffer: Buffer, mimeType: string } | null}
 */
export function getImageFromRequest(req, fieldNames = ['image', 'file', 'coverImage']) {
    for (const name of fieldNames) {
        const file = req.files?.[name]?.[0];
        if (file?.buffer?.length && file.mimetype) {
            return { buffer: file.buffer, mimeType: file.mimetype };
        }
    }
    return parseDataUrl(req.body?.image);
}

/**
 * Filters an object to exclude specified keys.
 *
 * @param {Object} obj - The source object.
 * @param {Array<string>} keysToExclude - List of keys to exclude from the object.
 * @param {Object|null} [objToInclude=null] - Object with keys to include in the result.
 * @returns {Object} - New object without the excluded keys.
 */
export function filterObject(obj, keysToExclude, objToInclude = null) {
    if (!obj || typeof obj !== 'object') {
        throw new Error('Invalid input: First argument must be an object.');
    }
    if (!Array.isArray(keysToExclude)) {
        throw new Error('Invalid input: Second argument must be an array of keys to exclude.');
    }

    const data = Object.keys(obj).reduce((filteredObj, key) => {
        if (!keysToExclude.includes(key)) {
            filteredObj[key] = obj[key];
        }
        return filteredObj;
    }, {});
    return objToInclude ? { ...objToInclude, ...data } : data;
}

/** Infer MIME type from URL path (e.g. .jpg -> image/jpeg). */
export function mimeFromUrl(url) {
    if (!url || typeof url !== 'string') return 'image/jpeg';
    const lower = url.split('?')[0].toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.webp')) return 'image/webp';
    if (lower.endsWith('.gif')) return 'image/gif';
    return 'image/jpeg';
}
