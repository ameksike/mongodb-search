import multer from 'multer';

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
export function multipart(req, res, next) {
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
