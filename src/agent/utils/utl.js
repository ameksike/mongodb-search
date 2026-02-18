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